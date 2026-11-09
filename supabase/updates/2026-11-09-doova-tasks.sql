-- Doova update, 9 Nov 2026: Doova tasks (Doova's own tasks, posted from admin, paid from the Doova budget).
-- Run the 7 Nov notifications update first if you haven't. Then paste all of this into a New query in the
-- Supabase SQL editor and press Run (choose "Run without RLS" if asked). Running it twice does no harm.

-- 018_doova_tasks.sql
-- 9 Nov 2026. Doova posts its own tasks from admin (promotions, feature tests, platform tests).
-- Decisions: no minimum reward (₦0 allowed, earns a small fixed XP) and no minimum slots; no 15% fee;
-- no approval queue (goes live at once); only owners create; paid from a Doova budget that owners top up.
-- Doova is a business account (organizations.is_platform); its wallet IS the Doova budget, so funding,
-- refunds of unused slots and payouts all use the same tested money paths.

-- ---------------------------------------------------------------------------
-- Doova, the creator
-- ---------------------------------------------------------------------------
alter table organizations add column if not exists is_platform boolean not null default false;
alter table organizations alter column owner_user_id drop not null;
do $$ begin
  alter table organizations add constraint organizations_owner_or_platform check (owner_user_id is not null or is_platform);
exception when duplicate_object then null; end $$;

insert into organizations (id, name, owner_user_id, kyc_tier, is_platform)
values ('00000000-0000-4000-8000-00000000d00a', 'Doova', null, 1, true)
on conflict (id) do nothing;

create or replace function doova_org() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000d00a'::uuid $$;
create or replace function doova_budget_account() returns uuid language sql as $$ select wallet_account('org', doova_org()) $$;

alter table tasks add column if not exists is_doova boolean
  generated always as (creator_type = 'org' and creator_id = '00000000-0000-4000-8000-00000000d00a'::uuid) stored;

-- Creators keep ₦500–₦500,000 and 5–5,000 slots; Doova's own tasks can pay ₦0 and have any slots from 1.
alter table tasks drop constraint if exists tasks_reward_kobo_check;
alter table tasks drop constraint if exists tasks_slots_check;
do $$ begin
  alter table tasks add constraint tasks_reward_kobo_check check (
    (is_doova and reward_kobo between 0 and 50000000) or (not is_doova and reward_kobo between 50000 and 50000000));
  alter table tasks add constraint tasks_slots_check check (
    (is_doova and slots between 1 and 100000) or (not is_doova and slots between 5 and 5000));
exception when duplicate_object then null; end $$;

insert into platform_settings (key, value, description) values
  ('xp_unpaid_task', '10', 'XP for an approved Doova task that pays ₦0.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Money paths: no fee, no tier check and no approval queue for Doova; skip ledger lines of ₦0.
-- ---------------------------------------------------------------------------
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
  if t.is_doova then
    v_bps := 0;                     -- Doova doesn't pay itself a fee
  else
    -- 4 Nov creator tiers: slot caps and task types by tier (spending never changes a tier).
    perform check_creator_tier_allows(t);
  end if;

  v_fee := (t.escrow_kobo * v_bps + 9999) / 10000;        -- round up to the kobo
  v_wallet := wallet_account(t.creator_type, t.creator_id);

  if t.escrow_kobo > 0 then
    v_txn := post_transaction(
      'fund_task', 'fund:' || p_task,
      jsonb_build_array(
        jsonb_build_object('account', v_wallet, 'direction', 'debit', 'amount', t.escrow_kobo + v_fee),
        jsonb_build_object('account', escrow_account(p_task), 'direction', 'credit', 'amount', t.escrow_kobo)
      ) || case when v_fee > 0 then jsonb_build_array(
        jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'credit', 'amount', v_fee)
      ) else '[]'::jsonb end,
      'task', p_task, case when t.is_doova then 'Doova task: rewards locked from the Doova budget' else 'Escrow + platform fee' end);
  end if;

  update tasks
     set fee_bps = v_bps, fee_kobo = v_fee, funded_at = now(), updated_at = now(),
         status = case when p_skip_moderation or t.is_doova then 'live'::task_status else 'under_moderation'::task_status end
   where id = p_task;
  return v_txn;
end $$;

-- Rewards go to the doer's Earnings (013); a ₦0 reward moves no money.
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

  if t.reward_kobo > 0 then
    v_txn := post_transaction(
      'release_reward', 'release:' || p_submission,
      jsonb_build_array(
        jsonb_build_object('account', escrow_account(t.id), 'direction', 'debit', 'amount', t.reward_kobo),
        jsonb_build_object('account', earnings_account(s.doer_id), 'direction', 'credit', 'amount', t.reward_kobo)
      ),
      'submission', p_submission, 'Reward released');
  end if;

  update submissions
     set status = 'approved', reviewed_by_user_id = p_reviewer, reviewed_at = now(),
         auto_approved = p_auto, updated_at = now()
   where id = p_submission;
  return v_txn;
end $$;

-- Staff with task approvals review Doova's own tasks.
create or replace function can_review(p_task uuid, p_user uuid) returns boolean
language sql stable as $$
  select case t.creator_type
           when 'user' then t.creator_id = p_user
           when 'org'  then exists (select 1 from org_members m
                                     where m.org_id = t.creator_id and m.user_id = p_user
                                       and m.role in ('owner', 'reviewer'))
         end
         or (t.is_doova and staff_can(p_user, 'task.moderate'))
    from tasks t where t.id = p_task
$$;

-- ₦0 Doova tasks still earn XP (a small fixed amount).
create or replace function submissions_award_xp() returns trigger
language plpgsql as $$
declare v_reward bigint;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select reward_kobo into v_reward from tasks where id = new.task_id;
    perform award_xp(new.doer_id, 'task',
                     case when v_reward = 0 then setting_int('xp_unpaid_task')::int
                          else least((v_reward / 5000)::int * setting_int('xp_per_naira_50')::int, setting_int('xp_task_max')::int) end,
                     new.id);
    perform award_badges(new.doer_id);
  end if;
  return new;
end $$;

-- Doova staff don't do Doova's own tasks.
create or replace function submissions_no_staff_on_doova() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from tasks t where t.id = new.task_id and t.is_doova)
     and exists (select 1 from staff_members m where m.user_id = new.doer_id and m.active) then
    raise exception 'Doova staff cannot do Doova tasks';
  end if;
  return new;
end $$;
drop trigger if exists submissions_no_staff_on_doova on submissions;
create trigger submissions_no_staff_on_doova before insert on submissions
  for each row execute function submissions_no_staff_on_doova();

-- ---------------------------------------------------------------------------
-- The Doova budget (owners only)
-- ---------------------------------------------------------------------------
-- Move fees Doova has already earned into the budget.
create or replace function staff_budget_from_fees(p_staff uuid, p_amount_kobo bigint) returns void
language plpgsql as $$
declare v_free bigint;
begin
  if not staff_can(p_staff, 'settings.update') then raise exception 'only an owner can top up the Doova budget'; end if;
  if p_amount_kobo <= 0 then raise exception 'enter an amount'; end if;
  v_free := coalesce(account_balance(platform_account('platform_revenue')), 0) - coalesce(account_balance(platform_account('processor_fees')), 0);
  if p_amount_kobo > v_free then raise exception 'only % kobo of earned fees is available', greatest(v_free, 0); end if;
  perform post_transaction('adjustment', 'budget_from_fees:' || gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'debit', 'amount', p_amount_kobo),
      jsonb_build_object('account', doova_budget_account(), 'direction', 'credit', 'amount', p_amount_kobo)),
    'org', doova_org(), 'Earned fees moved to the Doova budget');
  perform log_staff_action(p_staff, 'budget.from_fees', 'budget', 'doova', jsonb_build_object('amount_kobo', p_amount_kobo));
end $$;

-- Company money sent into Doova's Paystack balance: recorded like any deposit, once per reference.
create or replace function staff_budget_record_transfer(p_staff uuid, p_reference text, p_amount_kobo bigint) returns void
language plpgsql as $$
begin
  if not staff_can(p_staff, 'settings.update') then raise exception 'only an owner can top up the Doova budget'; end if;
  if p_amount_kobo <= 0 then raise exception 'enter an amount'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'enter the transfer reference'; end if;
  perform record_deposit('paystack', 'DOOVA-' || btrim(p_reference), 'org', doova_org(), 'bank_transfer', p_amount_kobo, 0);
  perform log_staff_action(p_staff, 'budget.transfer', 'budget', 'doova', jsonb_build_object('amount_kobo', p_amount_kobo, 'reference', p_reference));
end $$;

-- Launch (fund + live) and close a Doova task.
create or replace function staff_launch_doova_task(p_staff uuid, p_task uuid) returns void
language plpgsql as $$
declare t tasks%rowtype;
begin
  if not staff_can(p_staff, 'settings.update') then raise exception 'only an owner can create Doova tasks'; end if;
  select * into t from tasks where id = p_task;
  if not found or not t.is_doova then raise exception 'not a Doova task'; end if;
  if t.escrow_kobo > coalesce(account_balance(doova_budget_account()), 0) then
    raise exception 'the Doova budget is short by % kobo', t.escrow_kobo - coalesce(account_balance(doova_budget_account()), 0);
  end if;
  perform fund_task(p_task, true);
  perform log_staff_action(p_staff, 'doova_task.launch', 'task', p_task::text, jsonb_build_object('title', t.title, 'escrow_kobo', t.escrow_kobo));
end $$;

create or replace function staff_close_doova_task(p_staff uuid, p_task uuid) returns bigint
language plpgsql as $$
declare v bigint;
begin
  if not staff_can(p_staff, 'settings.update') then raise exception 'only an owner can close Doova tasks'; end if;
  if not exists (select 1 from tasks where id = p_task and is_doova) then raise exception 'not a Doova task'; end if;
  v := close_task(p_task);
  perform log_staff_action(p_staff, 'doova_task.close', 'task', p_task::text, jsonb_build_object('returned_kobo', v));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Money totals: the budget is Doova's own money, not owed to users.
-- ---------------------------------------------------------------------------
create or replace view v_money_totals as
select case
         when type = 'user_wallet' and owner_type = 'org' and owner_id = '00000000-0000-4000-8000-00000000d00a'::uuid then 'doova_budget'
         when type = 'user_wallet' and owner_type = 'org'      then 'business_funds'
         when type = 'user_wallet' and code like '%:earnings'  then 'earnings'
         when type = 'user_wallet'                             then 'creator_funds'
         when type = 'bank_custody'                            then 'custody_' || provider
         else type::text
       end as bucket,
       sum(balance_kobo)::bigint as balance_kobo,
       count(*)::int as accounts
  from ledger_accounts
 group by 1;

-- Doers see "From Doova".
create or replace view v_task_feed as
select t.id, t.title, t.category, t.reward_kobo, t.slots, t.ends_at, t.requires_nda,
       t.slots - (select count(*) from submissions s
                   where s.task_id = t.id
                     and submission_holds_slot(s.status, s.reserved_until, s.appeal_deadline)) as slots_left,
       t.kind, t.estimated_minutes, t.needs_laptop, t.went_live_at, t.instructions,
       t.creator_type, t.creator_id,
       coalesce(o.name, u.full_name, 'A Doova creator') as creator_name,
       coalesce(o.creator_tier, u.creator_tier) as creator_tier,
       t.is_doova
  from tasks t
  left join users u on t.creator_type = 'user' and u.id = t.creator_id
  left join organizations o on t.creator_type = 'org' and o.id = t.creator_id
 where t.status = 'live' and t.ends_at > now() and (t.starts_at is null or t.starts_at <= now());

-- Staff aren't told about Doova tasks they can't take part in.
create or replace function notify_task() returns trigger
language plpgsql as $$
declare t tasks%rowtype; who uuid;
begin
  select * into t from tasks where id = new.id;
  if not found then return null; end if;
  -- judge each change by its own before/after values (a task can be funded and approved in one transaction)
  if new.went_live_at is not null and old.went_live_at is null then
    for who in select task_creator_people(t.id) loop
      perform notify(who, 'task_live', t.title, null, '/create/tasks/' || t.id);
    end loop;
    -- doers who can do it (level allows the reward, not the creator's side, alerts on; no staff on Doova tasks)
    insert into notifications (user_id, kind, title, body, link, amount_kobo, collapse_key)
    select u.id, 'new_task', t.title, null, '/tasks/' || t.id, t.reward_kobo, 'new_tasks'
      from users u
      left join doer_levels l on l.level = u.level
     where u.status = 'active' and not u.staff_only and u.phone is not null and u.notify_new_tasks
       and (l.max_reward_kobo is null or l.max_reward_kobo >= t.reward_kobo)
       and (not t.needs_laptop or coalesce(l.laptop_tasks, false))
       and u.id not in (select task_creator_people(t.id))
       and not (t.is_doova and exists (select 1 from staff_members m where m.user_id = u.id and m.active))
    on conflict (user_id, collapse_key) where read_at is null and collapse_key is not null do update
       set count = notifications.count + 1, title = excluded.title, link = '/tasks', amount_kobo = excluded.amount_kobo,
           created_at = now(),
           pushed_at = case when notifications.pushed_at < now() - interval '3 hours' then null else notifications.pushed_at end;
  elsif new.moderated_at is not null and old.moderated_at is null and t.went_live_at is null then
    for who in select task_creator_people(t.id) loop
      perform notify(who, 'task_turned_down', t.title, t.moderation_note, '/create/tasks/' || t.id);
    end loop;
  end if;
  return null;
end $$;

revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
revoke all on v_money_totals, v_task_feed from anon, authenticated, public;
grant select on v_money_totals, v_task_feed to service_role;
