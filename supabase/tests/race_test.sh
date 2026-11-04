#!/usr/bin/env bash
# Race test: 40 doers try to reserve a 10-slot task at the same moment.
# Expect exactly 10 reservations. Run on a test database after the migrations in supabase/migrations.
# Usage: DATABASE_URL=postgres://... ./tests/race_test.sh
set -euo pipefail
P="psql $DATABASE_URL -qAt -v ON_ERROR_STOP=1"

T=$($P <<'SQL'
do $$
declare c uuid; t uuid; i int;
begin
  insert into users (phone, full_name, kyc_tier) values ('+2349990000000','Race Creator',1) returning id into c;
  perform record_deposit('paystack','RACE-DEP','user',c,'bank_transfer',1150000,0);
  insert into tasks (creator_type, creator_id, created_by_user_id, title, category, instructions,
                     proof_type, review_mode, reward_kobo, slots, ends_at, status)
  values ('user',c,c,'Race','native','x','form','auto',100000,10,now()+interval '1 day','pending_funding')
  returning id into t;
  perform fund_task(t,true);
  update tasks set went_live_at = now() - interval '1 hour' where id = t;   -- past early access
  for i in 1..40 loop
    insert into users (phone, full_name) values ('+23499900'||lpad(i::text,5,'0'),'Racer '||i);
  end loop;
end $$;
select id from tasks where title = 'Race';
SQL
)

for u in $($P -c "select id from users where full_name like 'Racer %'"); do
  $P -c "select reserve_slot('$T','$u')" >/dev/null 2>&1 &
done
wait

N=$($P -c "select count(*) from submissions where task_id='$T'")
echo "Reservations: $N (expected 10)"
[ "$N" = "10" ] && echo "RACE TEST PASSED" || { echo "RACE TEST FAILED"; exit 1; }
