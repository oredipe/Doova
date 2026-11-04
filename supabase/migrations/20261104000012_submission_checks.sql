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
