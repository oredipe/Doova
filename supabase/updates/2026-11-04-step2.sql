-- Step 2 update (4 Nov 2026) for a database set up before today: paste into Supabase → SQL Editor → Run, once.
-- Adds automatic checks on submitted work, wallet history, leaving a task, then the sample tasks.

-- 012_submission_checks.sql
-- Automatic checks on submitted work (decided 3 Nov 2026).
--
-- "Pay automatically when checks pass": attention checks right, required questions
-- answered, at least a third of the time estimate, one response per person and phone,
-- no copied written answers. A response that FAILS goes to the creator to decide
-- (it is no longer rejected outright); if they don't decide within their review window,
-- it is approved and paid like any other.

alter table submissions add column checks jsonb;   -- {"passed":bool,"failed":["attention", …],"seconds":n}

create or replace function submit_submission(
  p_submission uuid, p_doer uuid, p_answers jsonb,
  p_score numeric default null, p_passed_checks boolean default true, p_checks jsonb default null
) returns submission_status
language plpgsql as $$
declare
  s  submissions%rowtype;
  t  tasks%rowtype;
begin
  select * into s from submissions where id = p_submission for update;
  if not found or s.doer_id <> p_doer then raise exception 'not your submission'; end if;
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
         score = p_score, checks = p_checks, updated_at = now()
   where id = p_submission;

  if t.review_mode = 'auto' and p_passed_checks then
    perform approve_submission(p_submission, null, true);
    return 'approved';
  end if;
  return 'submitted';   -- manual review, or failed checks: the creator decides
end $$;

-- Old 5-argument version is replaced by the one above (the new argument has a default).
drop function if exists submit_submission(uuid, uuid, jsonb, numeric, boolean);

revoke all on function submit_submission(uuid, uuid, jsonb, numeric, boolean, jsonb) from anon, authenticated, public;
grant execute on function submit_submission(uuid, uuid, jsonb, numeric, boolean, jsonb) to service_role;

-- A person's wallet history, newest first (what the Wallet screen lists).
create or replace view v_wallet_history as
select a.owner_type, a.owner_id, e.id as entry_id, t.kind, t.memo, t.reference_type, t.reference_id,
       case when e.direction = 'credit' then e.amount_kobo else -e.amount_kobo end as amount_kobo,
       e.created_at
  from ledger_entries e
  join ledger_accounts a on a.id = e.account_id and a.type = 'user_wallet'
  join ledger_transactions t on t.id = e.transaction_id;

revoke all on v_wallet_history from anon, authenticated, public;
grant select on v_wallet_history to service_role;

-- A doer gives up a slot they are holding, so someone else can take it.
create or replace function withdraw_reservation(p_task uuid, p_doer uuid) returns void
language plpgsql as $$
begin
  update submissions set status = 'withdrawn', updated_at = now()
   where task_id = p_task and doer_id = p_doer and status = 'reserved';
end $$;
revoke all on function withdraw_reservation(uuid, uuid) from anon, authenticated, public;
grant execute on function withdraw_reservation(uuid, uuid) to service_role;

-- SAMPLE TASKS FOR TESTING ONLY (4 Nov 2026).
-- Adds a sample creator ("Doova sample tasks") and three live tasks so the doer flow can be tried
-- before creators can post (step 3). Paste into Supabase → SQL Editor and Run. Safe to run twice.
--
-- The sample creator's money is pretend: it is recorded as a Paystack deposit that never happened,
-- so the books show money in custody that isn't real. Fine for testing; before real launch, use a
-- fresh database (see the README), or run remove_demo_tasks.sql and reconcile.
do $$
declare c uuid; t uuid;
begin
  if exists (select 1 from users where phone = '+2340000000000') then
    raise notice 'sample tasks already added';
    return;
  end if;

  insert into users (phone, full_name, creator_tier, app_mode)
  values ('+2340000000000', 'Doova sample tasks', 2, 'create') returning id into c;
  perform record_deposit('paystack', 'DEMO-SEED-1', 'user', c, 'bank_transfer', 20000000, 0);   -- pretend ₦200,000

  -- 1. Instant pay when checks pass
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, kind, instructions, proof_type,
                     review_mode, reward_kobo, slots, estimated_minutes, attempt_minutes, ends_at, status, form_schema)
  values ('user', c, c, 'Your mobile money habits', 'native', 'survey',
          'Tell us how you send and receive money on your phone. There are no right or wrong answers, except the one question that checks you are reading carefully.',
          'form', 'auto', 50000, 50, 4, 20, now() + interval '30 days', 'pending_funding',
          '{"questions":[
            {"id":"q1","type":"single_choice","label":"Which do you use most to send money?","options":["Bank app","OPay","PalmPay","Moniepoint","USSD code","Other"],"required":true},
            {"id":"q2","type":"rating","label":"How much do you trust mobile money apps with your savings?","scale":5,"low":"Not at all","high":"Completely","required":true},
            {"id":"q3","type":"multi_choice","label":"What do you pay for with your phone? Choose all that apply.","options":["Airtime and data","Transport","Food","School fees","Bills","Shopping online"],"required":true},
            {"id":"q4","type":"single_choice","label":"To show you are reading, choose \"Sometimes\".","options":["Always","Sometimes","Never"],"required":true,"check":{"answer":"Sometimes"}},
            {"id":"q5","type":"long_text","label":"What one thing would make mobile money better for you?","min_length":30,"required":true}
          ]}'::jsonb)
  returning id into t;
  perform fund_task(t, true);

  -- 2. Quick ratings, instant pay
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, kind, instructions, proof_type,
                     review_mode, reward_kobo, slots, estimated_minutes, attempt_minutes, ends_at, status, form_schema)
  values ('user', c, c, 'Rate 5 snack advert ideas', 'native', 'review',
          'Read five short advert lines for a new plantain chip and rate each one.',
          'form', 'auto', 60000, 40, 3, 15, now() + interval '30 days', 'pending_funding',
          '{"questions":[
            {"id":"a1","type":"rating","label":"\"Crunch wey sweet die.\"","scale":5,"required":true},
            {"id":"a2","type":"rating","label":"\"Your 4 pm hunger has met its match.\"","scale":5,"required":true},
            {"id":"a3","type":"rating","label":"\"Made from Ondo plantain, fried in small batches.\"","scale":5,"required":true},
            {"id":"a4","type":"rating","label":"\"One bag, no sharing.\"","scale":5,"required":true},
            {"id":"a5","type":"rating","label":"\"The snack your mama would approve.\"","scale":5,"required":true},
            {"id":"a6","type":"single_choice","label":"Which line would make you buy it?","options":["Crunch wey sweet die","Your 4 pm hunger","Ondo plantain","One bag, no sharing","Mama would approve"],"required":true}
          ]}'::jsonb)
  returning id into t;
  perform fund_task(t, true);

  -- 3. The creator reviews every response (shows "Waiting for review")
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, kind, instructions, proof_type,
                     review_mode, reward_kobo, slots, estimated_minutes, attempt_minutes, auto_approve_hours, ends_at, status, form_schema)
  values ('user', c, c, 'Shopping habits in Lagos markets', 'proof_based', 'survey',
          'Share how you shop for food and household things. The creator reads every answer within 24 hours.',
          'form', 'manual', 100000, 30, 8, 30, 24, now() + interval '30 days', 'pending_funding',
          '{"questions":[
            {"id":"m1","type":"single_choice","label":"Where do you buy most of your food?","options":["Open market","Supermarket","Neighbourhood shop","Online","Street sellers"],"required":true},
            {"id":"m2","type":"short_text","label":"Which market or shop do you go to most?","required":true},
            {"id":"m3","type":"single_choice","label":"How do you usually pay there?","options":["Cash","Bank transfer","POS card","Mobile money app"],"required":true},
            {"id":"m4","type":"long_text","label":"Describe your last shopping trip: what you bought and how it went.","min_length":60,"required":true}
          ]}'::jsonb)
  returning id into t;
  perform fund_task(t, true);

  -- Past the 30-minute early access window for Pro and Expert doers.
  update tasks set went_live_at = now() - interval '1 hour' where creator_id = c;
end $$;
