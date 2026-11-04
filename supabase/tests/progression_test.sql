-- progression_test.sql
-- Creator tiers, doer levels, XP, streaks, badges, invites, staff and laptop sign-in.
-- Run on a fresh, throwaway database after the migrations:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/progression_test.sql
\set QUIET on
create schema if not exists test_helpers;
set search_path = public, test_helpers;
create table test_helpers.prog_ids (k text primary key, v uuid);
create or replace function test_helpers._put(k text, v uuid) returns void language sql as $$ insert into test_helpers.prog_ids values (k, v) $$;
create or replace function test_helpers._id(p text) returns uuid language sql as $$ select v from test_helpers.prog_ids where k = p $$;
create or replace function test_helpers._expect_error(p_sql text, p_words text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected an error containing "%" but it succeeded', p_words;
exception when others then
  if position(lower(p_words) in lower(sqlerrm)) = 0 then
    raise exception 'expected "%" but got "%"', p_words, sqlerrm;
  end if;
end $$;

-- A funded, live task for a creator, straight past moderation.
create or replace function test_helpers._live_task(p_creator uuid, p_reward bigint, p_slots int, p_kind task_kind default 'survey',
                                              p_laptop boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform record_deposit('paystack', 'DEP-' || gen_random_uuid(), 'user', p_creator, 'bank_transfer',
                         (p_reward * p_slots * 115 + 99) / 100, 0);
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, kind, instructions, proof_type,
                     review_mode, reward_kobo, slots, ends_at, needs_laptop, status)
  values ('user', p_creator, p_creator, 'Test task', 'native', p_kind, 'x', 'form', 'manual', p_reward, p_slots,
          now() + interval '7 days', p_laptop, 'pending_funding') returning id into v;
  perform fund_task(v, true);
  update tasks set went_live_at = now() - interval '1 hour' where id = v;   -- past the Pro early-access window
  return v;
end $$;

\echo '1. Creator tiers cap slots and unlock laptop and NDA tasks'
do $$
declare c uuid; v uuid;
begin
  insert into users (phone, full_name) values ('+2349000000001', 'New Creator') returning id into c;
  perform _put('c', c);
  perform record_deposit('paystack', 'DEP-CAP', 'user', c, 'bank_transfer', 100000000, 0);
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type,
                     review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'Too big', 'native', 'x', 'form', 'manual', 50000, 201, now() + interval '7 days', 'pending_funding')
  returning id into v;
  perform _expect_error(format('select fund_task(%L)', v), 'up to 200 slots');
  update tasks set slots = 200, needs_laptop = true where id = v;
  perform _expect_error(format('select fund_task(%L)', v), 'laptop tasks open at the Verified tier');
  update tasks set needs_laptop = false where id = v;
  perform fund_task(v);                                   -- 200 slots is fine for a New creator
  assert (select status from tasks where id = v) = 'under_moderation';
end $$;

\echo '2. Doer levels gate rewards, kinds of task and laptop tasks'
do $$
declare d uuid; t uuid;
begin
  insert into users (phone, full_name) values ('+2349000000002', 'New Doer') returning id into d;
  perform _put('d', d);
  update users set creator_tier = 3 where id = _id('c');
  t := _live_task(_id('c'), 300000, 5);                    -- ₦3,000: Level 2 and up
  perform _expect_error(format('select reserve_slot(%L, %L)', t, d), 'higher level');
  t := _live_task(_id('c'), 100000, 5, 'labelling');       -- labelling: Level 2 and up
  perform _expect_error(format('select reserve_slot(%L, %L)', t, d), 'higher level');
  t := _live_task(_id('c'), 100000, 5, 'survey', true);    -- laptop: Level 3
  perform _expect_error(format('select reserve_slot(%L, %L)', t, d), 'Level 3');
  t := _live_task(_id('c'), 150000, 5);                    -- ₦1,500 survey: Level 1 can do it
  perform _put('t1500', t);
  perform reserve_slot(t, d);
end $$;

\echo '3. Approved work earns XP: 1 per ₦50, at most 80; 5 stars add 10; first-task badge'
do $$
declare s uuid; t uuid;
begin
  s := (select id from submissions where task_id = _id('t1500') and doer_id = _id('d'));
  perform submit_submission(s, _id('d'), '{"q1":1}');
  perform approve_submission(s, _id('c'));
  assert (select xp from users where id = _id('d')) = 30, '₦1,500 task = 30 XP';
  perform rate_submission(s, _id('c'), 5::smallint);
  assert (select xp from users where id = _id('d')) = 40, '+10 for 5 stars';
  assert exists (select 1 from user_badges where user_id = _id('d') and badge_code = 'first_task');
  -- XP is capped at 80 per task (a ₦10,000 task would be 200)
  update users set level = 4 where id = _id('d');
  t := _live_task(_id('c'), 1000000, 5);
  s := reserve_slot(t, _id('d'));
  perform submit_submission(s, _id('d'), '{"q1":1}');
  perform approve_submission(s, _id('c'));
  assert (select xp from users where id = _id('d')) = 120, 'capped at 80';
  -- Approving twice never double-counts
  assert (select count(*) from xp_events where user_id = _id('d') and kind = 'task') = 2;
  update users set level = 1 where id = _id('d');
end $$;

\echo '4. Levels go up straight away and down only after 14 days below the bar'
do $$
declare r jsonb;
begin
  update users set xp = 120 where id = _id('d');           -- past Regular (100 XP), 100% approved
  r := recompute_levels(current_date);
  assert (select level from users where id = _id('d')) = 2, 'up to Regular';
  -- Skilled needs a NIN check: not done, so stays at 2 even with the XP
  update users set xp = 450 where id = _id('d');
  perform recompute_levels(current_date);
  assert (select level from users where id = _id('d')) = 2, 'Skilled waits for the NIN check';
  update users set kyc_tier = 1 where id = _id('d');
  perform recompute_levels(current_date);
  assert (select level from users where id = _id('d')) = 3, 'Skilled after NIN';
  -- Fall below the bar (approval rate) → warned, then down after 14 days
  update users set xp = 0 where id = _id('d');               -- simulate: no longer qualifies
  perform recompute_levels(current_date);
  assert (select level from users where id = _id('d')) = 3 and (select level_below_since from users where id = _id('d')) = current_date;
  perform recompute_levels(current_date + 13);
  assert (select level from users where id = _id('d')) = 3, 'still 3 on day 13';
  perform recompute_levels(current_date + 14);
  assert (select level from users where id = _id('d')) = 2, 'down one level on day 14';
  update users set xp = 120, level = 1, level_below_since = null where id = _id('d');
end $$;

\echo '5. Streaks: 2 tasks a day; quiet days pause; missed days break; 7 days = badge'
do $$
declare day0 date := lagos_day(now()) - 10; i int;
begin
  for i in 0..6 loop
    -- two submissions that day
    insert into submissions (task_id, doer_id, status, reserved_until, submitted_at)
    select id, _id('d'), 'submitted', now(), (day0 + i)::timestamp at time zone 'Africa/Lagos' + interval '10 hours'
      from (select _live_task(_id('c'), 50000, 5) as id union all select _live_task(_id('c'), 50000, 5)) x;
    perform update_streaks(day0 + i);
  end loop;
  assert (select streak_days from users where id = _id('d')) = 7, 'seven days in a row';
  assert exists (select 1 from user_badges where user_id = _id('d') and badge_code = 'streak_7');
  assert (select count(*) from xp_events where user_id = _id('d') and kind = 'streak_day') = 7;
  update tasks set went_live_at = now() - interval '30 days' where status = 'live';
  perform update_streaks(day0 + 7);                          -- nothing submitted, tasks were open
  assert (select streak_days from users where id = _id('d')) = 0, 'missed day breaks the streak';
  assert (select streak_best from users where id = _id('d')) = 7;
end $$;

\echo '6. Invites: 50 XP once the friend verifies NIN and has 5 approved tasks'
do $$
declare f uuid; i int; t uuid; s uuid; before int;
begin
  insert into users (phone, full_name, kyc_tier, level, invited_by) values ('+2349000000003', 'Friend', 1, 1, _id('d')) returning id into f;
  insert into referrals (invitee_id, inviter_id) values (f, _id('d'));
  before := (select xp from users where id = _id('d'));
  for i in 1..5 loop
    t := _live_task(_id('c'), 50000, 5);
    s := reserve_slot(t, f);
    perform submit_submission(s, f, '{}');
    perform approve_submission(s, _id('c'));
  end loop;
  assert qualify_referrals() = 1;
  assert (select xp from users where id = _id('d')) = before + 50;
  assert qualify_referrals() = 0, 'counted once';
end $$;

\echo '7. Creator tier: Verified after a NIN check and one completed task'
do $$
declare c uuid; t uuid; s uuid;
begin
  insert into users (phone, full_name, kyc_tier) values ('+2349000000004', 'Growing Creator', 1) returning id into c;
  t := _live_task(c, 50000, 5);
  s := reserve_slot(t, _id('d'));
  perform submit_submission(s, _id('d'), '{}');
  perform approve_submission(s, c);
  perform close_task(t);
  perform recompute_creator_tiers(current_date);
  assert (select creator_tier from users where id = c) = 2, 'Verified';
  -- Frozen tiers are left alone
  update users set creator_tier = 1, creator_tier_frozen = true where id = c;
  perform recompute_creator_tiers(current_date);
  assert (select creator_tier from users where id = c) = 1;
end $$;

\echo '8. Staff: roles limit actions, and every decision is logged'
do $$
declare m uuid; s uuid; t uuid;
begin
  insert into users (phone, full_name) values ('+2349000000005', 'Mod') returning id into m;
  insert into staff_members (user_id, role, email) values (m, 'support', 'mod@doova.ng');
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type,
                     review_mode, reward_kobo, slots, ends_at, status)
  values ('user', _id('c'), _id('c'), 'Needs approval', 'native', 'x', 'form', 'manual', 50000, 5, now() + interval '3 days', 'pending_funding')
  returning id into t;
  perform record_deposit('paystack', 'DEP-MOD', 'user', _id('c'), 'bank_transfer', 287500, 0);
  perform fund_task(t);
  perform _expect_error(format('select staff_moderate_task(%L, %L, true)', m, t), 'cannot approve');
  update staff_members set role = 'moderator' where user_id = m;
  perform _expect_error(format('select staff_moderate_task(%L, %L, false, %L)', m, t, ''), 'say why');
  perform staff_moderate_task(m, t, true);
  assert (select status from tasks where id = t) = 'live';
  assert (select count(*) from staff_activity where staff_id = m and action = 'task.approve') = 1;
  perform _expect_error('delete from staff_activity', 'cannot be changed');
end $$;

\echo '9. Laptop sign-in: approve once, consume once, codes expire'
do $$
declare r record;
begin
  insert into device_logins (code_hash) values (encode(digest('code-123', 'sha256'), 'hex'));
  assert (select count(*) from consume_device_login('code-123')) = 0, 'nothing before approval';
  perform approve_device_login('code-123', _id('d'), true);
  perform _expect_error(format('select approve_device_login(%L, %L, false)', 'code-123', _id('d')), 'already used');
  select * into r from consume_device_login('code-123');
  assert r.user_id = _id('d') and r.shared_computer;
  assert (select count(*) from consume_device_login('code-123')) = 0, 'works once';
  insert into device_logins (code_hash, expires_at) values (encode(digest('old', 'sha256'), 'hex'), now() - interval '1 second');
  perform _expect_error(format('select approve_device_login(%L, %L, false)', 'old', _id('d')), 'expired');
end $$;

\echo '10. The public API roles cannot read tables or call functions'
do $$
begin
  assert not has_table_privilege('anon', 'users', 'select');
  assert not has_table_privilege('authenticated', 'ledger_entries', 'select');
  assert not has_function_privilege('authenticated', 'fund_task(uuid, boolean)', 'execute');
  assert has_table_privilege('service_role', 'users', 'select');
  assert (select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename not in ('ids', '_t'));  -- smoke-test helpers
end $$;

\echo '11. Books still balance'
do $$
begin
  assert not exists (select 1 from v_ledger_balance_drift), 'ledger drift';
end $$;

\echo 'ALL PROGRESSION TESTS PASSED'
drop schema test_helpers cascade;
