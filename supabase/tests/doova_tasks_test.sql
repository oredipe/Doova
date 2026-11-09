-- doova_tasks_test.sql
-- Doova's own tasks: budget, no fee, no minimums, ₦0 with XP, owners only, refunds to the budget.
\set QUIET on
create schema if not exists test_helpers;
set search_path = public, test_helpers;
create or replace function test_helpers._expect_error(p_sql text, p_words text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected an error containing "%" but it succeeded', p_words;
exception when others then
  if position(lower(p_words) in lower(sqlerrm)) = 0 then
    raise exception 'expected "%" but got "%"', p_words, sqlerrm;
  end if;
end $$;

\echo '1. Limits: creators still need ₦500 and 5 slots; Doova can do ₦0 and 1 slot'
do $$
declare c uuid;
begin
  insert into users (phone, full_name) values ('+2349500000001', 'Limit Creator') returning id into c;
  perform _expect_error(format($q$insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
    values ('user', %L, %L, 'Cheap', 'native', 'x', 'form', 'auto', 0, 5, now() + interval '7 days', 'pending_funding')$q$, c, c), 'tasks_reward_kobo_check');
  perform _expect_error(format($q$insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
    values ('user', %L, %L, 'Few', 'native', 'x', 'form', 'auto', 50000, 1, now() + interval '7 days', 'pending_funding')$q$, c, c), 'tasks_slots_check');
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('org', doova_org(), c, 'Rate the new wallet screen', 'native', 'x', 'form', 'auto', 0, 1, now() + interval '7 days', 'pending_funding');
  assert (select is_doova from tasks where title = 'Rate the new wallet screen');
end $$;

\echo '2. Budget: only owners top up; fees move in; a company transfer is recorded once'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active order by added_at limit 1);
        m uuid := (select user_id from staff_members where role = 'moderator' and active limit 1);
        before bigint := coalesce(account_balance(doova_budget_account()), 0);
        free bigint := account_balance(platform_account('platform_revenue')) - account_balance(platform_account('processor_fees'));
begin
  assert o is not null and m is not null, 'needs staff from admin_test';
  perform _expect_error(format('select staff_budget_from_fees(%L, 100)', m), 'only an owner');
  perform _expect_error(format('select staff_budget_from_fees(%L, %s)', o, free + 1), 'earned fees is available');
  perform staff_budget_from_fees(o, 100000);
  perform staff_budget_record_transfer(o, 'GTB-001', 2000000);
  perform staff_budget_record_transfer(o, 'GTB-001', 2000000);        -- same reference again: once
  assert account_balance(doova_budget_account()) = before + 2100000;
end $$;
do $$ begin
  assert (select balance_kobo from v_money_totals where bucket = 'doova_budget') = account_balance(doova_budget_account()), 'budget shows in money totals';
end $$;

\echo '3. Launch: owner only, no fee, live at once, budget pays; short budget refused'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active order by added_at limit 1);
        m uuid := (select user_id from staff_members where role = 'moderator' and active limit 1);
        t uuid; big uuid; zero uuid := (select id from tasks where title = 'Rate the new wallet screen');
        b bigint := coalesce(account_balance(doova_budget_account()), 0);
begin
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('org', doova_org(), o, 'Promo: tell us about Doova', 'native', 'x', 'form', 'manual', 10000, 3, now() + interval '7 days', 'pending_funding') returning id into t;
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('org', doova_org(), o, 'Too big', 'native', 'x', 'form', 'auto', 50000000, 1000, now() + interval '7 days', 'pending_funding') returning id into big;
  perform _expect_error(format('select staff_launch_doova_task(%L, %L)', m, t), 'only an owner');
  perform _expect_error(format('select staff_launch_doova_task(%L, %L)', o, big), 'budget is short');
  perform staff_launch_doova_task(o, t);
  assert (select status from tasks where id = t) = 'live';
  assert (select fee_kobo from tasks where id = t) = 0;
  assert account_balance(doova_budget_account()) = b - 30000;
  perform staff_launch_doova_task(o, zero);
  assert (select status from tasks where id = zero) = 'live';
  assert account_balance(doova_budget_account()) = b - 30000, '₦0 task costs nothing';
end $$;

\echo '4. Doing them: staff can not; paid task pays Earnings; ₦0 gives fixed XP; moderator can review'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active order by added_at limit 1);
        m uuid := (select user_id from staff_members where role = 'moderator' and active limit 1);
        t uuid := (select id from tasks where title = 'Promo: tell us about Doova');
        z uuid := (select id from tasks where title = 'Rate the new wallet screen');
        d uuid; s uuid; s0 uuid; xp_before int;
begin
  update tasks set went_live_at = now() - interval '2 hours' where id in (t, z);
  perform _expect_error(format('select reserve_slot(%L, %L)', t, m), 'staff cannot do Doova tasks');
  insert into users (phone, full_name) values ('+2349500000002', 'Promo Doer') returning id into d;
  s := reserve_slot(t, d); perform submit_submission(s, d, '{}'::jsonb, null, true, '{}'::jsonb);
  perform approve_submission(s, m);                         -- a moderator reviews Doova tasks
  assert account_balance(earnings_account(d)) = 10000;
  xp_before := (select xp from users where id = d);
  s0 := reserve_slot(z, d); perform submit_submission(s0, d, '{}'::jsonb, 1, true, '{}'::jsonb);   -- auto, ₦0
  assert (select status from submissions where id = s0) = 'approved';
  assert (select xp from users where id = d) = xp_before + 10, '₦0 task gives 10 XP';
  assert exists (select 1 from v_task_feed where id = t and is_doova and creator_name = 'Doova');
end $$;

\echo '5. Closing returns unused rewards to the budget; books balance'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active order by added_at limit 1);
        t uuid := (select id from tasks where title = 'Promo: tell us about Doova');
        b bigint := account_balance(doova_budget_account()); r bigint;
        owed bigint; held bigint; income bigint; expense bigint; budget bigint;
begin
  r := staff_close_doova_task(o, t);
  assert r = 20000 and account_balance(doova_budget_account()) = b + 20000, 'two unused slots back';
  select coalesce(sum(balance_kobo) filter (where bucket in ('earnings', 'creator_funds', 'business_funds', 'task_escrow', 'payouts_in_flight')), 0),
         coalesce(sum(balance_kobo) filter (where bucket like 'custody_%'), 0),
         coalesce(sum(balance_kobo) filter (where bucket = 'platform_revenue'), 0),
         coalesce(sum(balance_kobo) filter (where bucket = 'processor_fees'), 0),
         coalesce(sum(balance_kobo) filter (where bucket = 'doova_budget'), 0)
    into owed, held, income, expense, budget from v_money_totals;
  assert held + expense = owed + income + budget, format('held %s + exp %s <> owed %s + income %s + budget %s', held, expense, owed, income, budget);
  assert not exists (select 1 from v_ledger_balance_drift);
end $$;

\echo 'ALL DOOVA TASK TESTS PASSED'
