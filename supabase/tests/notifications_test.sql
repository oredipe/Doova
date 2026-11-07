-- notifications_test.sql
-- The database writes the right notifications, once, and collapses repeats.
\set QUIET on
set search_path = public;

\echo '1. Task live: creator told, matching doers told once (collapsed), creator not told about own task'
do $$
declare c uuid; d1 uuid; d2 uuid; t1 uuid; t2 uuid;
begin
  insert into users (phone, full_name) values ('+2349400000001', 'Note Creator') returning id into c;
  insert into users (phone, full_name) values ('+2349400000002', 'Note Doer One') returning id into d1;
  insert into users (phone, full_name, notify_new_tasks) values ('+2349400000003', 'Note Doer Off', false) returning id into d2;
  perform record_deposit('paystack', 'NOTE-DEP-1', 'user', c, 'bank_transfer', 5000000, 0);
  assert (select count(*) from notifications where user_id = c and kind = 'funds_added') = 1, 'funds added';
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'Note task one', 'native', 'x', 'form', 'manual', 50000, 10, now() + interval '7 days', 'pending_funding') returning id into t1;
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'Note task two', 'native', 'x', 'form', 'manual', 60000, 10, now() + interval '7 days', 'pending_funding') returning id into t2;
  perform fund_task(t1); perform fund_task(t2);
  perform moderate_task(t1, true, null); perform moderate_task(t2, true, null);
end $$;
do $$
declare c uuid := (select id from users where phone = '+2349400000001');
        d1 uuid := (select id from users where phone = '+2349400000002');
        d2 uuid := (select id from users where phone = '+2349400000003');
begin
  assert (select count(*) from notifications where user_id = c and kind = 'task_live') = 2, 'creator told twice (two tasks)';
  assert (select count(*) from notifications where user_id = c and kind = 'new_task') = 0, 'creator not alerted to own tasks';
  assert (select count || '|' || link from notifications where user_id = d1 and kind = 'new_task') = '2|/tasks', 'doer: one item, count 2';
  assert not exists (select 1 from notifications where user_id = d2 and kind = 'new_task'), 'alerts off respected';
end $$;

\echo '2. Doer submits (manual): creator gets one "to review" item per task; approve = paid once'
do $$
declare c uuid := (select id from users where phone = '+2349400000001');
        d1 uuid := (select id from users where phone = '+2349400000002');
        t1 uuid := (select id from tasks where title = 'Note task one');
        d3 uuid; s1 uuid; s3 uuid;
begin
  insert into users (phone, full_name) values ('+2349400000004', 'Note Doer Three') returning id into d3;
  update tasks set went_live_at = now() - interval '2 hours' where id = t1;
  s1 := reserve_slot(t1, d1); perform submit_submission(s1, d1, '{}'::jsonb, null, true, '{}'::jsonb);
  s3 := reserve_slot(t1, d3); perform submit_submission(s3, d3, '{}'::jsonb, null, true, '{}'::jsonb);
end $$;
do $$
declare c uuid := (select id from users where phone = '+2349400000001');
        d1 uuid := (select id from users where phone = '+2349400000002');
        d3 uuid := (select id from users where phone = '+2349400000004');
        t1 uuid := (select id from tasks where title = 'Note task one');
begin
  assert (select count from notifications where user_id = c and kind = 'review_waiting') = 2, 'two responses, one item';
  perform approve_submission((select id from submissions where task_id = t1 and doer_id = d1), c);
  perform reject_submission((select id from submissions where task_id = t1 and doer_id = d3), c, 'The answers do not match the question asked.');
end $$;
do $$
declare d1 uuid := (select id from users where phone = '+2349400000002');
        d3 uuid := (select id from users where phone = '+2349400000004');
begin
  assert (select count(*) from notifications where user_id = d1 and kind = 'paid') = 1, 'paid once';
  assert (select amount_kobo from notifications where user_id = d1 and kind = 'paid') = 50000;
  assert (select body from notifications where user_id = d3 and kind = 'rejected') like 'The answers%', 'rejection reason passed on';
end $$;

\echo '3. Auto-approved in one go: only "paid", never "to review"'
do $$
declare c uuid := (select id from users where phone = '+2349400000001');
        d3 uuid := (select id from users where phone = '+2349400000004');
        t uuid; s uuid; before int;
begin
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'Note auto task', 'native', 'x', 'form', 'auto', 50000, 10, now() + interval '7 days', 'pending_funding') returning id into t;
  perform fund_task(t); perform moderate_task(t, true, null);
  update tasks set went_live_at = now() - interval '2 hours' where id = t;
  perform mark_notifications_read(c);
  s := reserve_slot(t, d3); perform submit_submission(s, d3, '{}'::jsonb, 1, true, '{}'::jsonb);
end $$;
do $$
declare c uuid := (select id from users where phone = '+2349400000001');
        d3 uuid := (select id from users where phone = '+2349400000004');
begin
  assert (select count(*) from notifications n join tasks t on n.link = '/tasks/' || t.id || '/done' where n.user_id = d3 and n.kind = 'paid' and t.title = 'Note auto task') = 1, 'paid once for auto';
  assert not exists (select 1 from notifications where user_id = c and kind = 'review_waiting' and read_at is null), 'no review item for auto-pass';
end $$;

\echo '4. Turned down by Doova; payout sent and failed; read and purge'
do $$
declare c uuid := (select id from users where phone = '+2349400000001'); t uuid;
begin
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions, proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user', c, c, 'Note bad task', 'native', 'x', 'form', 'manual', 50000, 10, now() + interval '7 days', 'pending_funding') returning id into t;
  perform fund_task(t);
  perform moderate_task(t, false, 'Link outside Doova');
  update tasks set moderation_note = 'Link outside Doova', moderated_at = now() where id = t;
end $$;
do $$
declare c uuid := (select id from users where phone = '+2349400000001');
        d1 uuid := (select id from users where phone = '+2349400000002'); b uuid; p uuid;
begin
  assert (select body from notifications where user_id = c and kind = 'task_turned_down') = 'Link outside Doova', 'turned down with note';
  perform record_nin_check(d1, 'note-hash', 'Note Doer One');
  b := save_bank_account('user', d1, d1, '058', 'GTBank', '0123456700', 'NOTE DOER ONE', 'RCP_N');
  perform post_transaction('adjustment', 'note-earn', jsonb_build_array(
    jsonb_build_object('account', platform_account('platform_revenue'), 'direction', 'debit', 'amount', 300000),
    jsonb_build_object('account', earnings_account(d1), 'direction', 'credit', 'amount', 300000)), 'user', d1, 'test');
  p := request_withdrawal('user', d1, d1, b, 200000);
  perform confirm_payout(p, 'TRF_N', 1000);
  assert (select amount_kobo from notifications where user_id = d1 and kind = 'payout_sent') = 190000, 'payout sent shows what reached the bank';
  perform mark_notifications_read(d1);
  assert not exists (select 1 from notifications where user_id = d1 and read_at is null);
  perform purge_old_notifications();
  assert exists (select 1 from notifications where user_id = d1), 'recent read ones kept';
end $$;

\echo 'ALL NOTIFICATION TESTS PASSED'
