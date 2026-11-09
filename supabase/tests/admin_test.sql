-- admin_test.sql
-- Staff: first owner, roles, moderation note, suspensions, money check, switches, totals.
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

\echo '1. First owner from SQL, then only owners add staff'
do $$
declare o uuid; m uuid; f uuid; x uuid;
begin
  insert into users (phone, full_name) values ('+2349100000001', 'Owner One') returning id into o;
  insert into users (phone, full_name) values ('+2349100000002', 'Mod Two') returning id into m;
  insert into users (phone, full_name) values ('+2349100000003', 'Fin Three') returning id into f;
  insert into users (phone, full_name) values ('+2349100000004', 'Other Four') returning id into x;
  perform _expect_error($q$select add_staff_member(null, '+2349100000002', 'moderator', 'm@x.ng')$q$, 'must be an owner');
  perform _expect_error($q$select add_staff_member(null, '+2349199999999', 'owner', 'o@x.ng')$q$, 'sign up in the app first');
  perform _expect_error($q$select add_staff_member(null, '+2349100000001', 'owner', 'not-an-email')$q$, 'valid email');
  perform add_staff_member(null, '+2349100000001', 'owner', 'Owner@X.ng');
  assert (select email from staff_members where user_id = o) = 'owner@x.ng';
  perform _expect_error($q$select add_staff_member(null, '+2349100000004', 'owner', 'o2@x.ng')$q$, 'owner already exists');
  perform add_staff_member(o, '+2349100000002', 'moderator', 'm@x.ng');
  perform add_staff_member(o, '+2349100000003', 'finance', 'f@x.ng');
  perform _expect_error(format($q$select add_staff_member(%L, '+2349100000004', 'support', 's@x.ng')$q$, m), 'only an owner');
  perform _expect_error(format('select staff_set_active(%L, %L, false)', o, o), 'cannot remove yourself');
  perform staff_set_active(o, f, false);
  assert not staff_can(f, 'reconcile');
  perform staff_set_active(o, f, true);
  assert staff_can(f, 'reconcile') and not staff_can(f, 'task.moderate') and staff_can(m, 'task.moderate');
  assert (select count(*) from staff_activity where action like 'staff.%' and staff_id = o) = 5;
end $$;

\echo '2. Moderation keeps the note; turning down needs a reason and refunds everything'
do $$
declare o uuid := (select id from users where phone = '+2349100000001');
        m uuid := (select id from users where phone = '+2349100000002');
        f uuid := (select id from users where phone = '+2349100000003');
        c uuid; t1 uuid; t2 uuid;
begin
  insert into users (phone, full_name) values ('+2349100000010', 'Creator') returning id into c;
  perform record_deposit('paystack', 'ADM-DEP-1', 'user', c, 'bank_transfer', 10000000, 0);
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type,
                     review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'One', 'native', 'x', 'form', 'manual', 50000, 10, now() + interval '7 days', 'pending_funding') returning id into t1;
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type,
                     review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'Two', 'native', 'x', 'form', 'manual', 50000, 10, now() + interval '7 days', 'pending_funding') returning id into t2;
  perform fund_task(t1); perform fund_task(t2);
  assert account_balance(wallet_account('user', c)) = 10000000 - 2 * 575000;
  perform _expect_error(format('select staff_moderate_task(%L, %L, true)', f, t1), 'cannot approve tasks');
  perform _expect_error(format($q$select staff_moderate_task(%L, %L, false, ' ')$q$, m, t1), 'say why');
  perform staff_moderate_task(m, t1, true);
  assert (select status from tasks where id = t1) = 'live';
  perform staff_moderate_task(o, t2, false, 'Link outside Doova');
  assert (select status from tasks where id = t2) = 'settled';
  assert (select moderation_note from tasks where id = t2) = 'Link outside Doova';
  assert (select moderated_by from tasks where id = t2) = o;
  assert account_balance(wallet_account('user', c)) = 10000000 - 575000;   -- task two refunded, fee included
  assert (select count(*) from staff_activity where action in ('task.approve', 'task.reject') and target_id in (t1::text, t2::text)) = 2;
end $$;

\echo '3. Suspending stops a person starting tasks'
do $$
declare m uuid := (select id from users where phone = '+2349100000002');
        f uuid := (select id from users where phone = '+2349100000003');
        d uuid; t uuid := (select id from tasks where title = 'One');
begin
  insert into users (phone, full_name) values ('+2349100000020', 'Doer') returning id into d;
  perform _expect_error(format($q$select staff_set_user_status(%L, %L, true, 'spam')$q$, f, d), 'cannot suspend');
  perform _expect_error(format($q$select staff_set_user_status(%L, %L, true, '')$q$, m, d), 'say why');
  perform _expect_error(format($q$select staff_set_user_status(%L, %L, true, 'x')$q$, m, m), 'yourself');
  perform staff_set_user_status(m, d, true, 'Same answers as another account');
  perform _expect_error(format('select reserve_slot(%L, %L)', t, d), 'not active');
  perform staff_set_user_status(m, d, false, 'Explained');
  update tasks set went_live_at = now() - interval '1 hour' where id = t;
  perform reserve_slot(t, d);
end $$;

\echo '4. Money check: matched, then a gap pauses withdrawals until an owner unpauses'
do $$
declare o uuid := (select id from users where phone = '+2349100000001');
        m uuid := (select id from users where phone = '+2349100000002');
        f uuid := (select id from users where phone = '+2349100000003');
        ledger bigint := account_balance(custody_account('paystack'));
        r bigint;
begin
  perform _expect_error(format('select staff_reconcile(%L, %L, current_date, 1)', m, 'paystack'), 'cannot run the money check');
  assert staff_reconcile(f, 'paystack', current_date - 1, ledger) = 0;
  assert not setting_bool('withdrawals_paused');
  r := staff_reconcile(f, 'paystack', current_date, ledger - 80000, 'Statement short');
  assert r = -80000 and setting_bool('withdrawals_paused');
  assert (select note from reconciliations where statement_date = current_date) = 'Statement short';
  perform staff_explain_reconciliation(f, (select id from reconciliations where statement_date = current_date), 'Paystack fee charged twice; refunded');
  perform _expect_error(format($q$select staff_set_switch(%L, 'withdrawals_paused', false)$q$, f), 'only an owner');
  perform _expect_error(format($q$select staff_set_switch(%L, 'platform_fee_bps', false)$q$, o), 'cannot be changed here');
  perform staff_set_switch(o, 'withdrawals_paused', false);
  assert not setting_bool('withdrawals_paused');
  perform staff_set_switch(o, 'pilot_all_tasks_need_approval', false);
  assert not setting_bool('pilot_all_tasks_need_approval');
  perform staff_set_switch(o, 'pilot_all_tasks_need_approval', true);
end $$;

\echo '5. Money totals add up to the custody balance'
do $$
declare owed bigint; held bigint; income bigint; expense bigint;
begin
  select coalesce(sum(balance_kobo) filter (where bucket in ('earnings', 'creator_funds', 'business_funds', 'task_escrow', 'payouts_in_flight')), 0),
         coalesce(sum(balance_kobo) filter (where bucket like 'custody_%'), 0),
         coalesce(sum(balance_kobo) filter (where bucket = 'platform_revenue'), 0),
         coalesce(sum(balance_kobo) filter (where bucket = 'processor_fees'), 0)
    into owed, held, income, expense from v_money_totals;
  assert held + expense = owed + income + coalesce((select balance_kobo from v_money_totals where bucket = 'doova_budget'), 0), format('held %s + exp %s <> owed %s + income %s', held, expense, owed, income);
  assert (select balance_kobo from v_money_totals where bucket = 'creator_funds') > 0;
end $$;

\echo 'ALL ADMIN TESTS PASSED'
