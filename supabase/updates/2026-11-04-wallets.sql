-- Doova update, 4 Nov 2026: separate Earnings and Creator funds.
-- Paste all of this into a New query in the Supabase SQL editor and press Run (choose "Run without RLS" if asked).
-- It moves money you already earned into Earnings. Running it twice does no harm.

-- 013_two_wallets.sql
-- Each person has two balances (decided 4 Nov 2026, after testing):
--   * Earnings       money from doing tasks (shown in Earn). Withdraw it to your bank.
--   * Creator funds  money added to pay for tasks, plus unused rewards that come back (shown in Create).
-- Businesses (organisations) only create, so they keep their single wallet.
--
-- The existing per-person wallet account becomes "Creator funds" (deposits, funding, refunds and
-- chargebacks already use it). Rewards now go to a new Earnings account.

create or replace function earnings_account(p_user uuid) returns uuid
language sql as $$
  select ledger_account('user:' || p_user || ':earnings', 'user_wallet', 'user', p_user)
$$;

-- Which balance a ledger wallet account is.
create or replace function wallet_purse(p_code text) returns text
language sql immutable as $$
  select case when p_code like '%:earnings' then 'earnings' else 'funds' end
$$;

alter table payouts add column if not exists purse text not null default 'earnings' check (purse in ('earnings', 'funds'));

-- Rewards go to the doer's Earnings.
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
      jsonb_build_object('account', earnings_account(s.doer_id), 'direction', 'credit', 'amount', t.reward_kobo)
    ),
    'submission', p_submission, 'Reward released');

  update submissions
     set status = 'approved', reviewed_by_user_id = p_reviewer, reviewed_at = now(),
         auto_approved = p_auto, updated_at = now()
   where id = p_submission;
  return v_txn;
end $$;

-- Withdrawals say which balance they come from (people only; businesses have one wallet).
drop function if exists request_withdrawal(owner_kind, uuid, uuid, uuid, bigint, payment_provider, boolean);
create or replace function request_withdrawal(
  p_owner_type owner_kind, p_owner_id uuid, p_requested_by uuid,
  p_bank_account uuid, p_amount_kobo bigint,
  p_provider payment_provider default 'paystack',
  p_close_account boolean default false,
  p_purse text default 'earnings'
) returns uuid
language plpgsql as $$
declare
  b         bank_accounts%rowtype;
  v_tier    smallint := owner_kyc_tier(p_owner_type, p_owner_id);
  v_purse   text := case when p_owner_type = 'org' then 'funds' else p_purse end;
  v_wallet  uuid;
  v_duty    bigint := 0;
  v_fee     bigint := 0;
  v_payout  uuid;
  v_txn     uuid;
begin
  if v_purse not in ('earnings', 'funds') then raise exception 'unknown balance %', p_purse; end if;
  v_wallet := case when v_purse = 'earnings' then earnings_account(p_owner_id) else wallet_account(p_owner_type, p_owner_id) end;
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
    if p_amount_kobo <> (select balance_kobo from ledger_accounts where id = v_wallet) then
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
                       withdrawal_fee_kobo, stamp_duty_kobo, is_account_closure, purse)
  values (p_owner_type, p_owner_id, p_bank_account, p_provider, p_amount_kobo,
          v_fee, v_duty, p_close_account, v_purse)
  returning id into v_payout;

  v_txn := post_transaction(
    'withdrawal_request', 'withdraw:' || v_payout,
    jsonb_build_array(
      jsonb_build_object('account', v_wallet, 'direction', 'debit', 'amount', p_amount_kobo),
      jsonb_build_object('account', platform_account('payouts_in_flight'), 'direction', 'credit', 'amount', p_amount_kobo - v_fee)
    ) || case when v_fee > 0 then jsonb_build_array(
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'credit', 'amount', v_fee)
    ) else '[]'::jsonb end,
    'payout', v_payout, 'Withdrawal requested');

  update payouts set request_txn_id = v_txn where id = v_payout;
  return v_payout;
end $$;

-- A failed transfer goes back to the balance it came from.
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
      jsonb_build_object('account', case when p.purse = 'earnings' and p.owner_type = 'user' then earnings_account(p.owner_id)
                                         else wallet_account(p.owner_type, p.owner_id) end,
                         'direction', 'credit', 'amount', p.amount_kobo)
    ) || case when p.withdrawal_fee_kobo > 0 then jsonb_build_array(
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'debit', 'amount', p.withdrawal_fee_kobo)
    ) else '[]'::jsonb end,
    'payout', p_payout, 'Payout failed, returned to wallet with the fee');
  update payouts set status = 'failed', failure_reason = p_reason, completed_at = now(), settle_txn_id = v_txn
   where id = p_payout;
end $$;

-- Views: which balance each row is.
create or replace view v_wallet_balances as
select a.owner_type, a.owner_id, a.balance_kobo, wallet_purse(a.code) as purse
  from ledger_accounts a where a.type = 'user_wallet';

drop view if exists v_wallet_history;
create view v_wallet_history as
select a.owner_type, a.owner_id, e.id as entry_id, t.kind, t.memo, t.reference_type, t.reference_id,
       case when e.direction = 'credit' then e.amount_kobo else -e.amount_kobo end as amount_kobo,
       e.created_at, wallet_purse(a.code) as purse
  from ledger_entries e
  join ledger_accounts a on a.id = e.account_id and a.type = 'user_wallet'
  join ledger_transactions t on t.id = e.transaction_id;

-- Move rewards already earned (before this change) from the shared wallet into Earnings.
do $$
declare r record; v_move bigint;
begin
  for r in
    select a.id, a.owner_id, a.balance_kobo,
           (select coalesce(sum(e.amount_kobo), 0) from ledger_entries e join ledger_transactions t on t.id = e.transaction_id
             where e.account_id = a.id and e.direction = 'credit' and t.kind = 'release_reward') as earned
      from ledger_accounts a where a.type = 'user_wallet' and a.owner_type = 'user' and a.code like '%:wallet'
  loop
    v_move := least(r.balance_kobo, r.earned);
    if v_move > 0 then
      perform post_transaction('adjustment', 'split_wallets:' || r.id,
        jsonb_build_array(
          jsonb_build_object('account', r.id, 'direction', 'debit', 'amount', v_move),
          jsonb_build_object('account', earnings_account(r.owner_id), 'direction', 'credit', 'amount', v_move)),
        'user', r.owner_id, 'Earnings moved to their own balance');
    end if;
  end loop;
end $$;

revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
revoke all on v_wallet_balances, v_wallet_history from anon, authenticated, public;
grant select on v_wallet_balances, v_wallet_history to service_role;
