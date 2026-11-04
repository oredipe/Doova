-- 006_workflows.sql
-- Business operations as database functions. The app calls these instead of
-- writing money or status columns directly, so every rule lives in one place.
--
-- Money in        record_deposit
-- Tasks           fund_task, close_task, refund_task_escrow
-- Doing tasks     sign_nda, reserve_slot, submit_submission
-- Reviewing       approve_submission, reject_submission, request_revision
-- Appeals         open_appeal, decide_appeal
-- Money out       request_withdrawal, confirm_payout, fail_payout
-- Risk            record_chargeback, reconcile_custody
-- Housekeeping    run_scheduled_jobs, purge_expired_responses

-- ===========================================================================
-- Money in
-- ===========================================================================
-- Called from the Paystack / Monnify webhook handler once the provider confirms money arrived.
-- The creator bears the collection fee: the wallet is credited with the net amount.
create or replace function record_deposit(
  p_provider payment_provider, p_provider_ref text,
  p_owner_type owner_kind, p_owner_id uuid,
  p_channel payment_channel, p_amount_kobo bigint, p_fee_kobo bigint default 0,
  p_virtual_account_id uuid default null, p_card_3ds_verified boolean default null
) returns uuid
language plpgsql as $$
declare
  v_payment uuid;
  v_txn     uuid;
begin
  select id into v_payment from payments where provider = p_provider and provider_ref = p_provider_ref;
  if v_payment is not null then
    return v_payment;                                     -- webhook replay
  end if;

  if p_channel = 'card' then
    if coalesce(p_card_3ds_verified, false) is false then
      raise exception 'card payments must pass 3-D Secure';
    end if;
    if owner_kyc_tier(p_owner_type, p_owner_id) < 1 then
      raise exception 'card funding requires tier 1 verification';
    end if;
  end if;

  insert into payments (owner_type, owner_id, provider, channel, provider_ref, virtual_account_id,
                        amount_kobo, fee_kobo, status, card_3ds_verified)
  values (p_owner_type, p_owner_id, p_provider, p_channel, p_provider_ref, p_virtual_account_id,
          p_amount_kobo, p_fee_kobo, 'succeeded', p_card_3ds_verified)
  returning id into v_payment;

  v_txn := post_transaction(
    'deposit', 'deposit:' || p_provider || ':' || p_provider_ref,
    jsonb_build_array(
      jsonb_build_object('account', custody_account(p_provider), 'direction', 'debit',  'amount', p_amount_kobo - p_fee_kobo),
      jsonb_build_object('account', wallet_account(p_owner_type, p_owner_id), 'direction', 'credit', 'amount', p_amount_kobo - p_fee_kobo)
    ),
    'payment', v_payment, 'Wallet top-up');

  update payments set ledger_transaction_id = v_txn where id = v_payment;
  return v_payment;
end $$;

-- ===========================================================================
-- Tasks
-- ===========================================================================
-- Locks reward × slots in escrow and takes the 15% fee, all from the creator's wallet.
-- The task goes to moderation (or straight live for trusted creators).
create or replace function fund_task(p_task uuid, p_skip_moderation boolean default false)
returns uuid
language plpgsql as $$
declare
  t        tasks%rowtype;
  v_fee    bigint;
  v_bps    integer := setting_int('platform_fee_bps');
  v_wallet uuid;
  v_txn    uuid;
begin
  select * into t from tasks where id = p_task for update;
  if not found then raise exception 'task % not found', p_task; end if;
  if t.status not in ('draft', 'pending_funding') then
    raise exception 'task % is % and cannot be funded', p_task, t.status;
  end if;
  if t.ends_at <= now() then raise exception 'task end date is in the past'; end if;
  -- 4 Nov creator tiers: slot caps and task types by tier (spending never changes a tier).
  perform check_creator_tier_allows(t);

  v_fee := (t.escrow_kobo * v_bps + 9999) / 10000;        -- round up to the kobo
  v_wallet := wallet_account(t.creator_type, t.creator_id);

  v_txn := post_transaction(
    'fund_task', 'fund:' || p_task,
    jsonb_build_array(
      jsonb_build_object('account', v_wallet, 'direction', 'debit', 'amount', t.escrow_kobo + v_fee),
      jsonb_build_object('account', escrow_account(p_task), 'direction', 'credit', 'amount', t.escrow_kobo),
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'credit', 'amount', v_fee)
    ),
    'task', p_task, 'Escrow + platform fee');

  update tasks
     set fee_bps = v_bps, fee_kobo = v_fee, funded_at = now(), updated_at = now(),
         status = case when p_skip_moderation then 'live'::task_status else 'under_moderation'::task_status end
   where id = p_task;
  return v_txn;
end $$;

-- Moderation decision on a funded task. Approved → live. Rejected → everything
-- (escrow AND fee) goes back to the creator, since the task never ran.
create or replace function moderate_task(p_task uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = p_task for update;
  if t.status <> 'under_moderation' then raise exception 'task % is not under moderation', p_task; end if;
  if p_approve then
    update tasks set status = 'live', updated_at = now() where id = p_task;
    return;
  end if;
  perform post_transaction(
    'refund_escrow', 'moderation_refund:' || p_task,
    jsonb_build_array(
      jsonb_build_object('account', escrow_account(p_task), 'direction', 'debit', 'amount', t.escrow_kobo),
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'debit', 'amount', t.fee_kobo),
      jsonb_build_object('account', wallet_account(t.creator_type, t.creator_id), 'direction', 'credit', 'amount', t.escrow_kobo + t.fee_kobo)
    ),
    'task', p_task, coalesce('Rejected by moderation: ' || p_note, 'Rejected by moderation'));
  update tasks set status = 'settled', settled_at = now(), closed_at = now(), updated_at = now()
   where id = p_task;
end $$;

-- Close a task (deadline passed or creator cancels). Open reviews and live
-- reservations finish; unused escrow goes back to the creator. Fee is not refunded.
create or replace function close_task(p_task uuid) returns bigint
language plpgsql as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = p_task for update;
  if t.status in ('closed', 'settled') then
    return refund_task_escrow(p_task);
  end if;
  if t.status not in ('live', 'paused', 'filled', 'under_moderation', 'rejected_by_moderation') then
    raise exception 'task % is % and cannot be closed', p_task, t.status;
  end if;
  update tasks
     set status = 'closed', closed_at = now(), updated_at = now(),
         responses_purge_after = now() + make_interval(days => setting_int('response_retention_days')::int)
   where id = p_task;
  return refund_task_escrow(p_task);
end $$;

-- Refund whatever escrow is not needed for rewards that may still be owed.
-- Safe to call repeatedly (scheduled job calls it until the task settles).
create or replace function refund_task_escrow(p_task uuid) returns bigint
language plpgsql as $$
declare
  t          tasks%rowtype;
  v_escrow   uuid := escrow_account(p_task);
  v_balance  bigint;
  v_pending  integer;
  v_refund   bigint;
begin
  select * into t from tasks where id = p_task for update;
  if t.status <> 'closed' then return 0; end if;

  v_balance := account_balance(v_escrow);
  select count(*) into v_pending from submissions
   where task_id = p_task and submission_reward_pending(status, reserved_until, appeal_deadline);
  v_refund := v_balance - t.reward_kobo * v_pending;

  if v_refund > 0 then
    perform post_transaction(
      'refund_escrow', 'refund:' || p_task || ':' || v_balance || ':' || v_pending,
      jsonb_build_array(
        jsonb_build_object('account', v_escrow, 'direction', 'debit', 'amount', v_refund),
        jsonb_build_object('account', wallet_account(t.creator_type, t.creator_id), 'direction', 'credit', 'amount', v_refund)
      ),
      'task', p_task, 'Unused escrow returned to creator');
  else
    v_refund := 0;
  end if;

  if account_balance(v_escrow) = 0 and v_pending = 0 then
    update tasks set status = 'settled', settled_at = now(), updated_at = now() where id = p_task;
  end if;
  return v_refund;
end $$;

-- ===========================================================================
-- Doing tasks
-- ===========================================================================
create or replace function sign_nda(
  p_task uuid, p_user uuid, p_signed_name text,
  p_ip inet default null, p_device uuid default null
) returns uuid
language plpgsql as $$
declare
  t     tasks%rowtype;
  v_id  uuid;
begin
  select * into t from tasks where id = p_task;
  if not t.requires_nda then raise exception 'task % does not require an NDA', p_task; end if;
  insert into nda_signatures (task_id, user_id, nda_document_id, version_hash, signed_name, ip_address, device_id)
  select p_task, p_user, d.id, d.version_hash, p_signed_name, p_ip, p_device
    from nda_documents d where d.id = t.nda_document_id
  on conflict (task_id, user_id) do nothing
  returning id into v_id;
  return coalesce(v_id, (select id from nda_signatures where task_id = p_task and user_id = p_user));
end $$;

-- Hold one slot for the doer. The task row lock makes over-booking impossible.
create or replace function reserve_slot(p_task uuid, p_doer uuid) returns uuid
language plpgsql as $$
declare
  t        tasks%rowtype;
  u        users%rowtype;
  v_held   integer;
  v_sub    submissions%rowtype;
  v_until  timestamptz;
begin
  select * into t from tasks where id = p_task for update;
  if not found then raise exception 'task % not found', p_task; end if;
  if t.status <> 'live' then raise exception 'task is not accepting submissions (%)', t.status; end if;
  if now() >= t.ends_at or (t.starts_at is not null and now() < t.starts_at) then
    raise exception 'task is outside its start and end dates';
  end if;

  select * into u from users where id = p_doer;
  if u.status <> 'active' then raise exception 'account is not active'; end if;
  if is_creator_side(t.creator_type, t.creator_id, p_doer) then
    raise exception 'creators cannot complete their own tasks';
  end if;
  perform check_doer_level_allows(t, u);
  if t.requires_nda and not exists (
       select 1 from nda_signatures s join nda_documents d on d.id = s.nda_document_id
        where s.task_id = p_task and s.user_id = p_doer and s.version_hash = d.version_hash) then
    raise exception 'sign the NDA before starting this task';
  end if;

  select count(*) into v_held from submissions
   where task_id = p_task and submission_holds_slot(status, reserved_until, appeal_deadline);
  if v_held >= t.slots then raise exception 'task is full'; end if;

  v_until := least(now() + make_interval(mins => t.attempt_minutes), t.ends_at);

  select * into v_sub from submissions where task_id = p_task and doer_id = p_doer for update;
  if found then
    if v_sub.status = 'reserved' and v_sub.reserved_until > now() then
      return v_sub.id;                                   -- already holding a slot
    elsif v_sub.status in ('expired', 'withdrawn') then
      update submissions set status = 'reserved', reserved_at = now(), reserved_until = v_until,
                             answers = null, updated_at = now()
       where id = v_sub.id;
      return v_sub.id;
    else
      raise exception 'one attempt per person: you already have a % submission', v_sub.status;
    end if;
  end if;

  insert into submissions (task_id, doer_id, reserved_until)
  values (p_task, p_doer, v_until)
  returning id into v_sub.id;
  return v_sub.id;
end $$;

-- Doer submits. Native (auto-review) tasks are approved instantly when they pass checks.
create or replace function submit_submission(
  p_submission uuid, p_doer uuid, p_answers jsonb,
  p_score numeric default null, p_passed_checks boolean default true
) returns submission_status
language plpgsql as $$
declare
  s  submissions%rowtype;
  t  tasks%rowtype;
begin
  select * into s from submissions where id = p_submission for update;
  if s.doer_id <> p_doer then raise exception 'not your submission'; end if;
  if s.status not in ('reserved', 'revision_requested') then
    raise exception 'submission is % and cannot be submitted', s.status;
  end if;
  if s.status = 'reserved' and s.reserved_until <= now() then
    update submissions set status = 'expired', updated_at = now() where id = p_submission;
    raise exception 'time limit passed; the slot was released';
  end if;

  select * into t from tasks where id = s.task_id;

  update submissions
     set status = 'submitted', submitted_at = now(), answers = p_answers,
         score = p_score, updated_at = now()
   where id = p_submission;

  if t.review_mode = 'auto' then
    if p_passed_checks then
      perform approve_submission(p_submission, null, true);
      return 'approved';
    else
      update submissions set status = 'rejected_final', reject_reason = 'Did not pass automatic checks',
                             reviewed_at = now(), updated_at = now()
       where id = p_submission;
      return 'rejected_final';
    end if;
  end if;
  return 'submitted';
end $$;

-- ===========================================================================
-- Reviewing
-- ===========================================================================
create or replace function can_review(p_task uuid, p_user uuid) returns boolean
language sql stable as $$
  select case t.creator_type
           when 'user' then t.creator_id = p_user
           when 'org'  then exists (select 1 from org_members m
                                     where m.org_id = t.creator_id and m.user_id = p_user
                                       and m.role in ('owner', 'reviewer'))
         end
    from tasks t where t.id = p_task
$$;

-- Moves one reward from task escrow to the doer's wallet: instant, ledger only.
-- p_reviewer null = automatic (auto-review task, auto-approve timer, or appeal decided by staff).
create or replace function approve_submission(p_submission uuid, p_reviewer uuid, p_auto boolean default false)
returns uuid
language plpgsql as $$
declare
  s     submissions%rowtype;
  t     tasks%rowtype;
  v_txn uuid;
begin
  select * into s from submissions where id = p_submission for update;
  select * into t from tasks where id = s.task_id;
  if s.status not in ('submitted', 'appealed') then
    raise exception 'submission is % and cannot be approved', s.status;
  end if;
  if p_reviewer is not null and not can_review(t.id, p_reviewer) then
    raise exception 'user % may not review this task', p_reviewer;
  end if;

  v_txn := post_transaction(
    'release_reward', 'release:' || p_submission,
    jsonb_build_array(
      jsonb_build_object('account', escrow_account(t.id), 'direction', 'debit', 'amount', t.reward_kobo),
      jsonb_build_object('account', wallet_account('user', s.doer_id), 'direction', 'credit', 'amount', t.reward_kobo)
    ),
    'submission', p_submission, 'Reward released');

  update submissions
     set status = 'approved', reviewed_by_user_id = p_reviewer, reviewed_at = now(),
         auto_approved = p_auto, updated_at = now()
   where id = p_submission;
  return v_txn;
end $$;

create or replace function reject_submission(p_submission uuid, p_reviewer uuid, p_reason text)
returns void
language plpgsql as $$
declare s submissions%rowtype;
begin
  select * into s from submissions where id = p_submission for update;
  if s.status <> 'submitted' then raise exception 'submission is % and cannot be rejected', s.status; end if;
  if not can_review(s.task_id, p_reviewer) then raise exception 'user % may not review this task', p_reviewer; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a rejection reason is required'; end if;
  update submissions
     set status = 'rejected', reject_reason = p_reason, reviewed_by_user_id = p_reviewer,
         reviewed_at = now(), updated_at = now(),
         appeal_deadline = now() + make_interval(hours => setting_int('appeal_window_hours')::int)
   where id = p_submission;
end $$;

-- One revision request per submission; the doer gets a fresh attempt window.
create or replace function request_revision(p_submission uuid, p_reviewer uuid, p_note text)
returns void
language plpgsql as $$
declare
  s submissions%rowtype;
  t tasks%rowtype;
begin
  select * into s from submissions where id = p_submission for update;
  select * into t from tasks where id = s.task_id;
  if s.status <> 'submitted' then raise exception 'submission is % and cannot be revised', s.status; end if;
  if not can_review(s.task_id, p_reviewer) then raise exception 'user % may not review this task', p_reviewer; end if;
  if s.reject_reason like 'REVISION:%' then raise exception 'only one revision request is allowed'; end if;
  update submissions
     set status = 'revision_requested', reject_reason = 'REVISION: ' || p_note,
         reserved_until = now() + make_interval(mins => t.attempt_minutes), updated_at = now()
   where id = p_submission;
end $$;

-- ===========================================================================
-- Appeals (decided by platform staff)
-- ===========================================================================
create or replace function open_appeal(p_submission uuid, p_doer uuid, p_reason text) returns uuid
language plpgsql as $$
declare
  s    submissions%rowtype;
  v_id uuid;
begin
  select * into s from submissions where id = p_submission for update;
  if s.doer_id <> p_doer then raise exception 'not your submission'; end if;
  if s.status <> 'rejected' or s.appeal_deadline <= now() then
    raise exception 'this rejection can no longer be appealed';
  end if;
  insert into appeals (submission_id, reason) values (p_submission, p_reason) returning id into v_id;
  update submissions set status = 'appealed', updated_at = now() where id = p_submission;
  return v_id;
end $$;

create or replace function decide_appeal(p_appeal uuid, p_staff uuid, p_for_doer boolean, p_note text)
returns void
language plpgsql as $$
declare a appeals%rowtype;
begin
  select * into a from appeals where id = p_appeal for update;
  if a.status <> 'open' then raise exception 'appeal already decided'; end if;
  update appeals
     set status = case when p_for_doer then 'upheld_for_doer'::appeal_status else 'upheld_for_creator'::appeal_status end,
         decided_by_user_id = p_staff, decided_at = now(), decision_note = p_note
   where id = p_appeal;
  if p_for_doer then
    perform approve_submission(a.submission_id, null, false);
    update submissions set reviewed_by_user_id = p_staff where id = a.submission_id;
  else
    update submissions set status = 'rejected_final', updated_at = now() where id = a.submission_id;
  end if;
end $$;

-- ===========================================================================
-- Money out
-- ===========================================================================
-- Moves the amount from the wallet to payouts-in-flight; the app then calls the
-- provider's transfer API and reports back with confirm_payout or fail_payout.
-- No withdrawal hold (decided). Doova's flat ₦100 fee is deducted from the amount and
-- booked as revenue; stamp duty is passed on; the provider's transfer fee is absorbed.
-- Closing an account (p_close_account) withdraws the whole balance with no minimum and no fee.
create or replace function request_withdrawal(
  p_owner_type owner_kind, p_owner_id uuid, p_requested_by uuid,
  p_bank_account uuid, p_amount_kobo bigint,
  p_provider payment_provider default 'paystack',
  p_close_account boolean default false
) returns uuid
language plpgsql as $$
declare
  b         bank_accounts%rowtype;
  v_tier    smallint := owner_kyc_tier(p_owner_type, p_owner_id);
  v_duty    bigint := 0;
  v_fee     bigint := 0;
  v_payout  uuid;
  v_txn     uuid;
begin
  if setting_bool('withdrawals_paused') then
    raise exception 'withdrawals are paused while the ledger is reconciled';
  end if;
  if v_tier < 1 then raise exception 'withdrawals require a NIN check first'; end if;
  if p_owner_type = 'user' and p_requested_by <> p_owner_id then
    raise exception 'you can only withdraw from your own wallet';
  end if;
  if p_owner_type = 'org' and not exists (
       select 1 from org_members where org_id = p_owner_id and user_id = p_requested_by
          and role = 'owner') then
    raise exception 'only the business owner can withdraw';
  end if;
  if p_close_account then
    if p_amount_kobo <> (select balance_kobo from ledger_accounts where id = wallet_account(p_owner_type, p_owner_id)) then
      raise exception 'closing an account withdraws the whole balance';
    end if;
  else
    if p_amount_kobo < setting_int('min_withdrawal_kobo') then
      raise exception 'minimum withdrawal is % kobo', setting_int('min_withdrawal_kobo');
    end if;
    v_fee := setting_int('withdrawal_fee_kobo');
  end if;

  select * into b from bank_accounts where id = p_bank_account;
  if not found or b.owner_type <> p_owner_type or b.owner_id <> p_owner_id then
    raise exception 'bank account does not belong to this wallet';
  end if;
  if not b.name_matched or b.verified_at is null then
    raise exception 'bank account name must match the verified name';
  end if;

  -- 3 Nov: no maximum and no daily limit; the only limit is the ₦1,500 minimum.

  if p_amount_kobo >= setting_int('stamp_duty_threshold_kobo') then
    v_duty := setting_int('stamp_duty_kobo');
  end if;

  if p_amount_kobo - v_fee - v_duty <= 0 then
    raise exception 'amount is too small to cover the fees';
  end if;

  insert into payouts (owner_type, owner_id, bank_account_id, provider, amount_kobo,
                       withdrawal_fee_kobo, stamp_duty_kobo, is_account_closure)
  values (p_owner_type, p_owner_id, p_bank_account, p_provider, p_amount_kobo,
          v_fee, v_duty, p_close_account)
  returning id into v_payout;

  -- Wallet pays the full amount; the fee is revenue now, the rest is in flight to the bank.
  v_txn := post_transaction(
    'withdrawal_request', 'withdraw:' || v_payout,
    jsonb_build_array(
      jsonb_build_object('account', wallet_account(p_owner_type, p_owner_id), 'direction', 'debit', 'amount', p_amount_kobo),
      jsonb_build_object('account', platform_account('payouts_in_flight'), 'direction', 'credit', 'amount', p_amount_kobo - v_fee)
    ) || case when v_fee > 0 then jsonb_build_array(
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'credit', 'amount', v_fee)
    ) else '[]'::jsonb end,
    'payout', v_payout, 'Withdrawal requested');

  update payouts set request_txn_id = v_txn where id = v_payout;
  return v_payout;
end $$;

-- Provider confirmed the transfer. Money leaves custody: transfer + stamp duty (= amount - fee),
-- plus the provider's transfer fee, which the platform absorbs as an expense.
create or replace function confirm_payout(p_payout uuid, p_provider_ref text, p_processor_fee_kobo bigint)
returns void
language plpgsql as $$
declare
  p     payouts%rowtype;
  v_txn uuid;
begin
  select * into p from payouts where id = p_payout for update;
  if p.status = 'succeeded' then return; end if;              -- webhook replay
  if p.status not in ('pending', 'processing') then
    raise exception 'payout is % and cannot be confirmed', p.status;
  end if;

  v_txn := post_transaction(
    'payout_confirmed', 'payout_ok:' || p_payout,
    jsonb_build_array(
      jsonb_build_object('account', platform_account('payouts_in_flight'), 'direction', 'debit', 'amount', p.amount_kobo - p.withdrawal_fee_kobo),
      jsonb_build_object('account', custody_account(p.provider), 'direction', 'credit', 'amount', p.amount_kobo - p.withdrawal_fee_kobo)
    ),
    'payout', p_payout, 'Payout confirmed by provider');

  if p_processor_fee_kobo > 0 then
    perform post_transaction(
      'payout_fee', 'payout_fee:' || p_payout,
      jsonb_build_array(
        jsonb_build_object('account', platform_account('processor_fees'), 'direction', 'debit', 'amount', p_processor_fee_kobo),
        jsonb_build_object('account', custody_account(p.provider), 'direction', 'credit', 'amount', p_processor_fee_kobo)
      ),
      'payout', p_payout, 'Transfer fee absorbed by platform');
  end if;

  update payouts
     set status = 'succeeded', provider_ref = p_provider_ref, processor_fee_kobo = p_processor_fee_kobo,
         completed_at = now(), settle_txn_id = v_txn
   where id = p_payout;
end $$;

-- Provider rejected the transfer: the money goes back to the wallet in full, fee included.
create or replace function fail_payout(p_payout uuid, p_reason text) returns void
language plpgsql as $$
declare
  p     payouts%rowtype;
  v_txn uuid;
begin
  select * into p from payouts where id = p_payout for update;
  if p.status = 'failed' then return; end if;
  if p.status not in ('pending', 'processing') then
    raise exception 'payout is % and cannot be failed', p.status;
  end if;
  v_txn := post_transaction(
    'payout_reversed', 'payout_fail:' || p_payout,
    jsonb_build_array(
      jsonb_build_object('account', platform_account('payouts_in_flight'), 'direction', 'debit', 'amount', p.amount_kobo - p.withdrawal_fee_kobo),
      jsonb_build_object('account', wallet_account(p.owner_type, p.owner_id), 'direction', 'credit', 'amount', p.amount_kobo)
    ) || case when p.withdrawal_fee_kobo > 0 then jsonb_build_array(
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'debit', 'amount', p.withdrawal_fee_kobo)
    ) else '[]'::jsonb end,
    'payout', p_payout, 'Payout failed, returned to wallet with the fee');
  update payouts set status = 'failed', failure_reason = p_reason, completed_at = now(), settle_txn_id = v_txn
   where id = p_payout;
end $$;

-- ===========================================================================
-- Risk
-- ===========================================================================
-- Card dispute: the provider takes the amount plus its fee from custody; the creator's
-- wallet is debited the same, even if that makes it negative (they then owe the platform,
-- and cannot fund or withdraw until it is repaid). The owner is flagged for review.
create or replace function record_chargeback(
  p_payment uuid, p_amount_kobo bigint, p_provider_ref text, p_reason text
) returns uuid
language plpgsql as $$
declare
  pay    payments%rowtype;
  v_fee  bigint := setting_int('chargeback_fee_kobo');
  v_cb   uuid;
  v_txn  uuid;
begin
  select * into pay from payments where id = p_payment;
  if pay.channel <> 'card' then raise exception 'only card payments can be charged back'; end if;

  insert into chargebacks (payment_id, amount_kobo, fee_kobo, provider_ref, reason)
  values (p_payment, p_amount_kobo, v_fee, p_provider_ref, p_reason)
  on conflict (payment_id) do nothing
  returning id into v_cb;
  if v_cb is null then return (select id from chargebacks where payment_id = p_payment); end if;

  v_txn := post_transaction(
    'chargeback', 'chargeback:' || p_payment,
    jsonb_build_array(
      jsonb_build_object('account', wallet_account(pay.owner_type, pay.owner_id), 'direction', 'debit', 'amount', p_amount_kobo + v_fee),
      jsonb_build_object('account', custody_account(pay.provider), 'direction', 'credit', 'amount', p_amount_kobo + v_fee)
    ),
    'chargeback', v_cb, 'Card chargeback + processor fee');

  update chargebacks set ledger_transaction_id = v_txn where id = v_cb;
  if pay.owner_type = 'user' then
    update users set is_flagged = true, updated_at = now() where id = pay.owner_id;
  end if;
  return v_cb;
end $$;

-- Daily: compare ledger custody with the provider statement. Any gap pauses withdrawals.
create or replace function reconcile_custody(p_provider payment_provider, p_date date, p_statement_kobo bigint)
returns bigint
language plpgsql as $$
declare
  v_ledger bigint := account_balance(custody_account(p_provider));
  v_diff   bigint := p_statement_kobo - v_ledger;
begin
  insert into reconciliations (provider, statement_date, statement_kobo, ledger_kobo, withdrawals_paused)
  values (p_provider, p_date, p_statement_kobo, v_ledger, v_diff <> 0)
  on conflict (provider, statement_date) do update
     set statement_kobo = excluded.statement_kobo, ledger_kobo = excluded.ledger_kobo,
         withdrawals_paused = excluded.withdrawals_paused, created_at = now();
  if v_diff <> 0 then
    update platform_settings set value = 'true', updated_at = now() where key = 'withdrawals_paused';
  end if;
  return v_diff;
end $$;

-- ===========================================================================
-- Housekeeping: run every minute from a scheduler (pg_cron or the app's job runner)
-- ===========================================================================
create or replace function run_scheduled_jobs() returns jsonb
language plpgsql as $$
declare
  v_expired   integer;
  v_auto      integer := 0;
  v_final     integer;
  v_closed    integer := 0;
  v_settled   integer := 0;
  r           record;
begin
  -- 1. Release reservations whose time ran out.
  update submissions set status = 'expired', updated_at = now()
   where status = 'reserved' and reserved_until <= now();
  get diagnostics v_expired = row_count;

  -- 2. Auto-approve submissions the creator did not review in time.
  for r in
    select s.id from submissions s join tasks t on t.id = s.task_id
     where s.status = 'submitted'
       and s.submitted_at + make_interval(hours => t.auto_approve_hours) <= now()
  loop
    perform approve_submission(r.id, null, true);
    v_auto := v_auto + 1;
  end loop;

  -- 3. Rejections whose appeal window passed become final (frees the slot).
  update submissions set status = 'rejected_final', updated_at = now()
   where status = 'rejected' and appeal_deadline <= now();
  get diagnostics v_final = row_count;

  -- 4. Close tasks past their end date.
  for r in select id from tasks where status in ('live', 'paused', 'filled') and ends_at <= now() loop
    perform close_task(r.id);
    v_closed := v_closed + 1;
  end loop;

  -- 5. Refund and settle closed tasks as their last submissions resolve.
  for r in select id from tasks where status = 'closed' loop
    perform refund_task_escrow(r.id);
  end loop;
  select count(*) into v_settled from tasks where status = 'settled' and settled_at >= now() - interval '1 minute';

  return jsonb_build_object('expired', v_expired, 'auto_approved', v_auto, 'rejections_finalised', v_final,
                            'tasks_closed', v_closed, 'tasks_settled_recently', v_settled);
end $$;

-- NDPA retention: clear survey answers after the retention period (run daily).
create or replace function purge_expired_responses() returns integer
language plpgsql as $$
declare v_count integer;
begin
  update submissions s
     set answers = null, answers_purged_at = now(), updated_at = now()
    from tasks t
   where t.id = s.task_id and t.responses_purge_after <= now()
     and s.answers is not null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ===========================================================================
-- Read views for the app
-- ===========================================================================
create view v_task_feed as
select t.id, t.title, t.category, t.reward_kobo, t.slots, t.ends_at, t.requires_nda,
       t.slots - (select count(*) from submissions s
                   where s.task_id = t.id
                     and submission_holds_slot(s.status, s.reserved_until, s.appeal_deadline)) as slots_left
  from tasks t
 where t.status = 'live' and t.ends_at > now() and (t.starts_at is null or t.starts_at <= now());

create view v_wallet_balances as
select a.owner_type, a.owner_id, a.balance_kobo
  from ledger_accounts a where a.type = 'user_wallet';
