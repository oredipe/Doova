-- tests/smoke_test.sql
-- End-to-end check of the money and task rules on a FRESH database with all
-- migrations applied. Each DO block is its own transaction, so the deferred
-- "every transaction balances" check really runs at commit.
-- Run:  psql -v ON_ERROR_STOP=1 -d <testdb> -f tests/smoke_test.sql
-- Any failed ASSERT stops the run with a message. Amounts are kobo (₦1 = 100).

\set QUIET on
\pset tuples_only on
create table if not exists _t (name text primary key, id uuid);

create or replace function _id(p text) returns uuid language sql as $$ select id from _t where name = p $$;
create or replace function _put(p text, v uuid) returns void language sql as $$
  insert into _t values (p, v) on conflict (name) do update set id = excluded.id $$;
create or replace function _bal(p uuid) returns bigint language sql as $$
  select coalesce((select balance_kobo from ledger_accounts where id = p), 0) $$;
create or replace function _wallet(p text) returns bigint language sql as $$
  select _bal(wallet_account('user', _id(p))) $$;
-- Run a statement that MUST fail, and check the error mentions the expected words.
create or replace function _expect_error(p_sql text, p_words text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_words) in lower(sqlerrm)) = 0 then
      raise exception 'expected error "%" but got "%"', p_words, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected an error containing "%" but it succeeded: %', p_words, p_sql;
end $$;

\echo '1. Users, bank accounts'
do $$
declare v uuid;
begin
  insert into users (phone, full_name, kyc_tier, privacy_consent_at) values ('+2348000000001', 'Ada Creator', 1, now()) returning id into v; perform _put('creator', v);
  insert into users (phone, full_name, kyc_tier, privacy_consent_at) values ('+2348000000002', 'Bola Doer',   1, now()) returning id into v; perform _put('d1', v);
  insert into users (phone, full_name, kyc_tier, privacy_consent_at) values ('+2348000000003', 'Chidi Doer',  1, now()) returning id into v; perform _put('d2', v);
  insert into users (phone, full_name, kyc_tier, privacy_consent_at) values ('+2348000000004', 'Dayo Doer',   0, now()) returning id into v; perform _put('d3', v);
  insert into users (phone, full_name, kyc_tier) values ('+2348000000005', 'Staff Member', 1) returning id into v; perform _put('staff', v);
  insert into bank_accounts (owner_type, owner_id, bank_code, account_number, account_name, name_matched, verified_at)
    values ('user', _id('d1'), '035', '0123456789', 'Bola Doer', true, now()) returning id into v; perform _put('d1_bank', v);
  insert into bank_accounts (owner_type, owner_id, bank_code, account_number, account_name, name_matched, verified_at)
    values ('user', _id('d2'), '058', '0987654321', 'Chidi Doer', true, now()) returning id into v; perform _put('d2_bank', v);
  -- Test fixtures: an established creator (Trusted) and experienced doers (Expert), so the
  -- tier and level rules (tested separately in progression_test.sql) don't get in the way here.
  update users set creator_tier = 3 where id = _id('creator');
  update users set level = 5 where id in (_id('d1'), _id('d2'), _id('d3'));
  -- One NIN per account
  update users set nin_hash = 'hash-A' where id = _id('d1');
  perform _expect_error(format('update users set nin_hash = %L where id = %L', 'hash-A', _id('d2')), 'duplicate key');
end $$;

\echo '2. Deposit by bank transfer: creator pays ₦115,500, Paystack keeps a ₦500 fee, wallet gets ₦115,000'
do $$
declare v uuid;
begin
  v := record_deposit('paystack', 'PSTK-TX-1', 'user', _id('creator'), 'bank_transfer', 11550000, 50000);
  perform _put('dep1', v);
  assert _wallet('creator') = 11500000, 'creator wallet should be ₦115,000';
  assert _bal(custody_account('paystack')) = 11500000, 'Paystack custody should be ₦115,000';
  -- Webhook replay changes nothing
  assert record_deposit('paystack', 'PSTK-TX-1', 'user', _id('creator'), 'bank_transfer', 11550000, 50000) = v;
  assert _wallet('creator') = 11500000, 'replayed webhook must not credit twice';
end $$;

\echo '3. Card rules: 3-D Secure and tier 1 required'
do $$
begin
  perform _expect_error(format($q$select record_deposit('paystack','PS-1','user',%L,'card',500000,0,null,false)$q$, _id('creator')), '3-D Secure');
  perform _expect_error(format($q$select record_deposit('paystack','PS-2','user',%L,'card',500000,0,null,true)$q$, _id('d3')), 'tier 1');
end $$;

\echo '4. Task rules: minimum ₦500 reward, maximum 72h auto-approve'
do $$
begin
  perform _expect_error(format($q$insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
     proof_type, review_mode, reward_kobo, slots, ends_at) values ('user', %L, %L, 'x', 'native', 'x', 'form', 'auto', 49999, 1, now() + interval '7 days')$q$,
     _id('creator'), _id('creator')), 'reward_kobo');
  perform _expect_error(format($q$insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
     proof_type, review_mode, reward_kobo, slots, ends_at, auto_approve_hours) values ('user', %L, %L, 'x', 'native', 'x', 'form', 'auto', 50000, 1, now() + interval '7 days', 73)$q$,
     _id('creator'), _id('creator')), 'auto_approve_hours');
end $$;

\echo '5. Fund the ₦1,000 × 100 survey: ₦100,000 escrow + ₦15,000 fee (15%)'
do $$
declare v uuid;
begin
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
                     proof_type, review_mode, reward_kobo, slots, ends_at, auto_approve_hours, status)
  values ('user', _id('creator'), _id('creator'), 'Shopping habits survey', 'proof_based', 'Answer honestly',
          'form', 'manual', 100000, 100, now() + interval '7 days', 24, 'pending_funding')
  returning id into v;
  perform _put('survey', v);
  perform fund_task(v);
  assert (select status from tasks where id = v) = 'under_moderation';
  assert (select fee_kobo from tasks where id = v) = 1500000, 'fee should be ₦15,000';
  assert _wallet('creator') = 0, 'creator wallet should be empty after funding';
  assert _bal(escrow_account(v)) = 10000000, 'escrow should be ₦100,000';
  assert _bal(platform_account('platform_revenue')) = 1500000, 'revenue should be ₦15,000';
  perform _expect_error(format('select fund_task(%L)', v), 'cannot be funded');
  perform moderate_task(v, true);
  assert (select status from tasks where id = v) = 'live';
end $$;

\echo '6. Creator cannot do own task; tier-0 doers CAN earn'
do $$
begin
  perform _expect_error(format('select reserve_slot(%L, %L)', _id('survey'), _id('creator')), 'own tasks');
end $$;

\echo '7. Doer 1: reserve → submit → creator approves → ₦1,000 instantly in wallet'
do $$
declare s uuid;
begin
  s := reserve_slot(_id('survey'), _id('d1'));
  perform _put('s1', s);
  assert submit_submission(s, _id('d1'), '{"q1":5}') = 'submitted';
  perform approve_submission(s, _id('creator'));
  assert _wallet('d1') = 100000, 'd1 should have ₦1,000';
  assert _bal(escrow_account(_id('survey'))) = 9900000, 'escrow should be ₦99,000';
  perform _expect_error(format('select approve_submission(%L, %L)', s, _id('creator')), 'cannot be approved');
  perform _expect_error(format('select reserve_slot(%L, %L)', _id('survey'), _id('d1')), 'one attempt per person');
  perform _expect_error(format('select approve_submission(%L, %L)', s, _id('d2')), 'cannot be approved');
end $$;

\echo '8. Doer 2: rejected → appeals → staff side with doer → paid'
do $$
declare s uuid; a uuid;
begin
  s := reserve_slot(_id('survey'), _id('d2'));
  perform submit_submission(s, _id('d2'), '{"q1":3}');
  perform _expect_error(format('select reject_submission(%L, %L, %L)', s, _id('d1'), 'bad'), 'may not review');
  perform reject_submission(s, _id('creator'), 'Answers too short');
  a := open_appeal(s, _id('d2'), 'I answered every question');
  perform decide_appeal(a, _id('staff'), true, 'Answers meet the brief');
  assert (select status from submissions where id = s) = 'approved';
  assert _wallet('d2') = 100000, 'd2 should have ₦1,000 after winning appeal';
end $$;

\echo '9. Doer 3: creator never reviews → auto-approved after their 24h window'
do $$
declare s uuid; r jsonb;
begin
  s := reserve_slot(_id('survey'), _id('d3'));
  perform submit_submission(s, _id('d3'), '{"q1":4}');
  update submissions set submitted_at = now() - interval '25 hours' where id = s;
  r := run_scheduled_jobs();
  assert (r->>'auto_approved')::int = 1, 'one submission should auto-approve';
  assert (select auto_approved from submissions where id = s);
  assert _wallet('d3') = 100000;
end $$;

\echo '10. Slots cannot be over-booked; expired reservations free the slot'
do $$
declare v uuid; s uuid; f uuid;
begin
  insert into users (phone, full_name, kyc_tier) values ('+2348000000010', 'Second Creator', 1) returning id into v;
  perform _put('creator2', v);
  perform record_deposit('paystack', 'PSTK-TX-2', 'user', v, 'bank_transfer', 287500, 0);  -- ₦2,875 = 5 × ₦500 + 15% fee
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
                     proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user', v, v, 'One-slot quiz', 'native', 'Quick quiz', 'form', 'auto', 50000, 5, now() + interval '1 day', 'pending_funding')
  returning id into v;
  perform _put('quiz', v);
  perform fund_task(v, true);                       -- trusted creator: straight to live
  assert _wallet('creator2') = 0, 'small creator fully spent ₦2,875';
  for i in 1..4 loop                               -- four other doers take four slots
    insert into users (phone, full_name, level) values ('+23480100000' || i, 'Filler ' || i, 5) returning id into f;
    perform reserve_slot(v, f);
  end loop;
  s := reserve_slot(v, _id('d1'));
  perform _expect_error(format('select reserve_slot(%L, %L)', v, _id('d2')), 'task is full');
  update submissions set reserved_until = now() - interval '1 second' where id = s;
  perform run_scheduled_jobs();
  s := reserve_slot(v, _id('d2'));                  -- slot freed
  assert submit_submission(s, _id('d2'), '{"score":90}', 90, true) = 'approved', 'auto task approves on pass';
  assert _wallet('d2') = 150000;
end $$;

\echo '11. NDA tasks: must sign the current NDA before starting'
do $$
declare v uuid;
begin
  perform record_deposit('paystack', 'PSTK-TX-3', 'user', _id('creator'), 'bank_transfer', 575000, 0);  -- 5 × ₦1,000 + 15%
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
                     proof_type, review_mode, reward_kobo, slots, ends_at, requires_nda, nda_document_id, status)
  values ('user', _id('creator'), _id('creator'), 'Confidential review', 'proof_based', 'Review the deck',
          'file', 'manual', 100000, 5, now() + interval '3 days', true,
          (select id from nda_documents limit 1), 'pending_funding')
  returning id into v;
  perform fund_task(v, true);
  perform _expect_error(format('select reserve_slot(%L, %L)', v, _id('d1')), 'sign the NDA');
  perform sign_nda(v, _id('d1'), 'Bola Doer', '102.89.1.1');
  perform reserve_slot(v, _id('d1'));
  perform _put('nda_task', v);
end $$;

\echo '12. Withdrawals: ₦1,500 minimum, ₦100 fee, verified bank, no hold, transfer fee absorbed'
do $$
declare p uuid; custody_before bigint; revenue_before bigint;
begin
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 100000)$q$, _id('d1'), _id('d1'), _id('d1_bank')), 'minimum withdrawal');
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 150000)$q$, _id('d2'), _id('d2'), _id('d1_bank')), 'does not belong');
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 150000)$q$, _id('d3'), _id('d3'), _id('d1_bank')), 'NIN check');
  custody_before := _bal(custody_account('paystack'));
  revenue_before := _bal(platform_account('platform_revenue'));

  -- A failed transfer gives everything back, the ₦100 fee included.
  p := request_withdrawal('user', _id('d2'), _id('d2'), _id('d2_bank'), 150000);
  assert _wallet('d2') = 0, 'd2 wallet debited immediately';
  assert (select withdrawal_fee_kobo from payouts where id = p) = 10000, '₦100 fee';
  assert (select transfer_kobo from payouts where id = p) = 140000, '₦1,400 reaches the bank';
  assert _bal(platform_account('platform_revenue')) = revenue_before + 10000, 'fee booked as revenue';
  perform fail_payout(p, 'Account dormant');
  assert _wallet('d2') = 150000, 'reversed in full, fee included';
  assert _bal(platform_account('platform_revenue')) = revenue_before, 'fee reversed';

  -- Second try succeeds.
  p := request_withdrawal('user', _id('d2'), _id('d2'), _id('d2_bank'), 150000);
  assert (select stamp_duty_kobo from payouts where id = p) = 0, 'no stamp duty under ₦10,000';
  perform confirm_payout(p, 'PSTK-OUT-1', 1000);              -- ₦10 transfer fee
  perform confirm_payout(p, 'PSTK-OUT-1', 1000);              -- replay is harmless
  assert _bal(custody_account('paystack')) = custody_before - 140000 - 1000, 'custody pays ₦1,400 transfer + ₦10 fee';
  assert _bal(platform_account('platform_revenue')) = revenue_before + 10000, 'Doova keeps ₦100';
  assert _bal(platform_account('processor_fees')) = 1000;
  assert _bal(platform_account('payouts_in_flight')) = 0;
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 150000)$q$, _id('d2'), _id('d2'), _id('d2_bank')), 'insufficient balance');
end $$;

\echo '13. Closing an account: whole balance, no minimum, no fee'
do $$
declare p uuid; revenue_before bigint;
begin
  revenue_before := _bal(platform_account('platform_revenue'));
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 50000, 'paystack', true)$q$, _id('d1'), _id('d1'), _id('d1_bank')), 'whole balance');
  p := request_withdrawal('user', _id('d1'), _id('d1'), _id('d1_bank'), 100000, 'paystack', true);
  assert _wallet('d1') = 0;
  assert (select withdrawal_fee_kobo from payouts where id = p) = 0, 'no fee on closure';
  assert (select transfer_kobo from payouts where id = p) = 100000, 'full ₦1,000 reaches the bank';
  assert _bal(platform_account('platform_revenue')) = revenue_before;
  perform confirm_payout(p, 'PSTK-OUT-2', 1000);
  assert _bal(platform_account('payouts_in_flight')) = 0;
end $$;

\echo '14. Close survey: 97 unused slots refunded (₦97,000); fee kept; task settles'
do $$
declare refunded bigint; before bigint;
begin
  before := _wallet('creator');
  refunded := close_task(_id('survey'));
  assert refunded = 9700000, format('expected ₦97,000 refund, got %s', refunded);
  assert _wallet('creator') = before + 9700000;
  assert _bal(escrow_account(_id('survey'))) = 0;
  assert (select status from tasks where id = _id('survey')) = 'settled';
  assert (select responses_purge_after from tasks where id = _id('survey')) is not null;
end $$;

\echo '15. Closing with a pending review keeps that reward in escrow until it resolves'
do $$
declare s uuid;
begin
  s := (select id from submissions where task_id = _id('nda_task') and doer_id = _id('d1'));
  perform submit_submission(s, _id('d1'), '{"notes":"Slide 4 numbers do not add up"}');
  assert close_task(_id('nda_task')) = 400000, 'the 4 unused slots come back now; the reward under review stays in escrow';
  assert (select status from tasks where id = _id('nda_task')) = 'closed';
  perform approve_submission(s, _id('creator'));
  perform run_scheduled_jobs();
  assert (select status from tasks where id = _id('nda_task')) = 'settled';
end $$;

\echo '16. Moderation rejection refunds escrow AND fee'
do $$
declare v uuid; before bigint;
begin
  before := _wallet('creator');
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
                     proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user', _id('creator'), _id('creator'), 'Write my exam', 'proof_based', 'x', 'text', 'manual',
          50000, 5, now() + interval '1 day', 'pending_funding') returning id into v;
  perform fund_task(v);
  assert _wallet('creator') = before - 287500;   -- 5 × ₦500 + 15%
  perform moderate_task(v, false, 'Academic cheating is not allowed');
  assert _wallet('creator') = before, 'full refund including fee';
end $$;

\echo '17. Chargeback: amount + ₦2,500 fee debited; wallet may go negative; user flagged'
do $$
declare pay uuid; v uuid;
begin
  insert into users (phone, full_name, kyc_tier) values ('+2348000000020', 'Card Fraudster', 1) returning id into v;
  perform _put('fraud', v);
  pay := record_deposit('paystack', 'PS-CARD-9', 'user', v, 'card', 1000000, 15000, null, true);
  assert _wallet('fraud') = 985000;
  perform record_chargeback(pay, 1000000, 'PS-CB-9', 'Stolen card');
  assert _wallet('fraud') = 985000 - 1000000 - 250000, 'wallet negative: they owe the platform';
  assert (select is_flagged from users where id = v);
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 150000)$q$, v, v, _id('d1_bank')), 'does not belong');
end $$;

\echo '18. Ledger integrity'
do $$
begin
  assert not exists (select 1 from v_ledger_balance_drift), 'cached balances drifted from entries';
  assert (select debit_side_kobo = credit_side_kobo from v_ledger_trial_balance), 'trial balance does not balance';
  perform _expect_error('update ledger_entries set amount_kobo = 1', 'insert-only');
  perform _expect_error('delete from ledger_transactions', 'insert-only');
  perform _expect_error(format($q$select post_transaction('adjustment','bad-1', jsonb_build_array(
      jsonb_build_object('account', %L::uuid, 'direction','debit','amount',100),
      jsonb_build_object('account', %L::uuid, 'direction','credit','amount',99)))$q$,
      custody_account('paystack'), platform_account('platform_revenue')), 'must equal');
end $$;

\echo '19. Reconciliation gap pauses withdrawals'
do $$
declare diff bigint;
begin
  diff := reconcile_custody('paystack', current_date, _bal(custody_account('paystack')));
  assert diff = 0 and not setting_bool('withdrawals_paused');
  diff := reconcile_custody('paystack', current_date, _bal(custody_account('paystack')) - 500);
  assert diff = -500 and setting_bool('withdrawals_paused');
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 100000)$q$, _id('d2'), _id('d2'), _id('d2_bank')), 'paused');
  update platform_settings set value = 'false' where key = 'withdrawals_paused';
end $$;

\echo '20. NDPA retention purge'
do $$
declare n int;
begin
  update tasks set responses_purge_after = now() - interval '1 second' where id = _id('survey');
  n := purge_expired_responses();
  assert n = 3, format('expected 3 purged answers, got %s', n);
end $$;

\echo '21. Two-way 5-star ratings: approved work only, blind until both rate or 72 hours'
do $$
declare s1 uuid := _id('s1'); s2 uuid; s3 uuid; other uuid; r record;
begin
  select id into s2 from submissions where task_id = _id('survey') and doer_id = _id('d2');
  select id into s3 from submissions where task_id = _id('survey') and doer_id = _id('d3');
  select id into other from submissions where status <> 'approved' limit 1;

  -- Doer rates the creator: hidden until the creator rates back.
  perform rate_submission(s1, _id('d1'), 5::smallint, 'Clear questions, paid fast');
  assert (select count(*) from v_visible_ratings where submission_id = s1) = 0, 'blind until both rate';
  perform rate_submission(s1, _id('creator'), 4::smallint);
  assert (select count(*) from v_visible_ratings where submission_id = s1) = 2, 'both visible once both rated';
  assert (select ratee_id from ratings where submission_id = s1 and rater_role = 'creator') = _id('d1');

  perform _expect_error(format('select rate_submission(%L, %L, 5::smallint)', s1, _id('d1')), 'already rated');
  perform _expect_error(format('select rate_submission(%L, %L, 5::smallint)', s1, _id('d2')), 'took no part');
  perform _expect_error(format('select rate_submission(%L, %L, 2::smallint)', s2, _id('d2')), 'say what went wrong');
  perform _expect_error(format('select rate_submission(%L, %L, 0::smallint)', s2, _id('d2')), 'between 1 and 5');
  if other is not null then
    perform _expect_error(format('select rate_submission(%L, %L, 5::smallint)', other, _id('creator')), 'only approved');
  end if;

  -- Only the doer rated: shown after 72 hours anyway.
  perform rate_submission(s2, _id('d2'), 3::smallint);
  assert (select count(*) from v_visible_ratings where submission_id = s2) = 0;
  update submissions set reviewed_at = now() - interval '73 hours' where id = s2;
  assert (select count(*) from v_visible_ratings where submission_id = s2) = 1, 'revealed after 72 hours';

  -- Window closes after 7 days.
  update submissions set reviewed_at = now() - interval '8 days' where id = s3;
  perform _expect_error(format('select rate_submission(%L, %L, 5::smallint)', s3, _id('d3')), 'window has closed');

  -- Averages: creator has 5 and 3 = 4.0 from 2 ratings, too few to show yet.
  select * into r from v_rating_summary where ratee_type = 'user' and ratee_id = _id('creator');
  assert r.ratings = 2 and r.average = 4.0 and r.rated_as = 'creator' and not r.show_average, 'creator summary';
  select * into r from v_rating_summary where ratee_id = _id('d1');
  assert r.ratings = 1 and r.average = 4.0 and r.rated_as = 'doer', 'doer summary';

  -- Final once given; staff hide instead of delete.
  perform _expect_error(format('update ratings set stars = 1 where submission_id = %L and rater_role = %L', s1, 'doer'), 'final');
  perform _expect_error(format('delete from ratings where submission_id = %L', s1), 'cannot be deleted');
  update ratings set hidden = true, hidden_reason = 'Abusive comment' where submission_id = s2;
  assert (select ratings from v_rating_summary where ratee_id = _id('creator')) = 1, 'hidden rating no longer counts';
end $$;

\echo ''
\echo 'Final balances (₦):'
\pset tuples_only off
select code, (balance_kobo / 100.0)::numeric(14,2) as naira from ledger_accounts
 where balance_kobo <> 0 order by type, code;
\echo 'ALL SMOKE TESTS PASSED'
