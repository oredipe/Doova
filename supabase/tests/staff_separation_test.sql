-- staff_separation_test.sql
-- Staff can't decide on their own tasks or work; admin-only accounts.
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

\echo '1. A staff member can not approve their own task; another can'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active limit 1);
        m uuid := (select user_id from staff_members where role = 'moderator' and active limit 1);
        t uuid;
begin
  assert o is not null and m is not null, 'needs the staff from admin_test';
  perform record_deposit('paystack', 'SEP-DEP-1', 'user', m, 'bank_transfer', 2000000, 0);
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type,
                     review_mode, reward_kobo, slots, ends_at, status)
  values ('user', m, m, 'Moderator own task', 'native', 'x', 'form', 'manual', 50000, 10, now() + interval '7 days', 'pending_funding') returning id into t;
  perform fund_task(t);
  assert staff_conflict(m, t) and not staff_conflict(o, t);
  perform _expect_error(format('select staff_moderate_task(%L, %L, true)', m, t), 'your own task');
  perform staff_moderate_task(o, t, true);
  assert (select status from tasks where id = t) = 'live';
end $$;

\echo '2. Appeals: not when you are the doer or the task creator'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active limit 1);
        m uuid := (select user_id from staff_members where role = 'moderator' and active limit 1);
        t uuid := (select id from tasks where title = 'Moderator own task');
        d uuid; s uuid; a uuid;
begin
  insert into users (phone, full_name) values ('+2349300000001', 'Sep Doer') returning id into d;
  update tasks set went_live_at = now() - interval '2 hours' where id = t;
  s := reserve_slot(t, d);
  perform submit_submission(s, d, '{}'::jsonb, null, true, '{}'::jsonb);
  perform reject_submission(s, m, 'Answers do not match the question asked.');
  a := open_appeal(s, d, 'I followed the instructions exactly as written.');
  perform _expect_error(format($q$select staff_decide_appeal(%L, %L, true, 'ok fine paid')$q$, m, a), 'your own task');
  perform staff_decide_appeal(o, a, true, 'Instructions were followed, paid.');
  assert (select status from submissions where id = s) = 'approved';
  -- the owner as a doer on someone else's task can't decide their own appeal
  assert staff_conflict(o, t, o) and not staff_conflict(o, t, d);
end $$;

\echo '3. Admin-only accounts: no phone, owner only, must change the password'
do $$
declare o uuid := (select user_id from staff_members where role = 'owner' and active limit 1);
        m uuid := (select user_id from staff_members where role = 'moderator' and active limit 1);
        n uuid := gen_random_uuid();
begin
  perform _expect_error(format($q$select add_staff_only_account(%L, gen_random_uuid(), 'x@y.ng', 'Some One', 'support')$q$, m), 'only an owner');
  perform _expect_error(format($q$select add_staff_only_account(%L, gen_random_uuid(), 'x@y.ng', 'Mononym', 'support')$q$, o), 'first and last name');
  perform add_staff_only_account(o, n, 'Ada@Doova.ng', 'Ada Obi', 'moderator');
  assert (select phone is null and staff_only from users where id = n);
  assert (select must_change_password and email = 'ada@doova.ng' from staff_members where user_id = n);
  assert staff_can(n, 'task.moderate');
  perform staff_password_changed(n);
  assert not (select must_change_password from staff_members where user_id = n);
  perform _expect_error($q$insert into users (phone, full_name) values (null, 'No Phone')$q$, 'users_phone_or_staff_only');
end $$;

\echo 'ALL STAFF SEPARATION TESTS PASSED'
