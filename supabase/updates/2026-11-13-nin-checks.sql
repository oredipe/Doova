-- Doova update, 13 Nov 2026: NIN checks through Monnify (attempt log, 3 tries a day, date of birth from NIN).
-- Paste into a New query in the Supabase SQL editor and press Run. Safe to run more than once.
-- Run the 12 Nov update (2026-11-12-profile-details.sql) first if you haven't.

-- 022_nin_checks.sql
-- 13 Nov 2026. NIN checks through Monnify (₦60 per successful lookup).
-- * Every attempt is logged (never the NIN itself), so people get at most 3 tries a day and staff can see failures.
-- * The NIN's date of birth is saved when the account has none, and must match it when it has one.
-- * An NIN showing someone under 18 flags the account for staff.

create table if not exists nin_checks (
  id bigserial primary key,
  user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  provider text not null,
  outcome text not null check (outcome in ('passed', 'name_mismatch', 'dob_mismatch', 'under_18', 'not_found', 'duplicate', 'error')),
  charged boolean not null default false,          -- the provider charged for this lookup
  detail text                                      -- short reason for staff; never the NIN, its name or date of birth
);
create index if not exists nin_checks_user_idx on nin_checks (user_id, created_at desc);
alter table nin_checks enable row level security;   -- server only; no policies

create or replace function record_nin_check(p_user uuid, p_nin_hash text, p_legal_name text, p_dob date) returns void
language plpgsql as $$
begin
  perform record_nin_check(p_user, p_nin_hash, p_legal_name);
  if p_dob is not null then
    if p_dob > (current_date - interval '18 years')::date then raise exception 'must be 18 or older'; end if;
    update users set date_of_birth = coalesce(date_of_birth, p_dob), updated_at = now() where id = p_user;
  end if;
end $$;
