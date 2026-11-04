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
