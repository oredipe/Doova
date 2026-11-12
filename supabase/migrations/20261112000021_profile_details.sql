-- 021_profile_details.sql
-- 12 Nov 2026. Age at sign-up and "Your profile".
-- * Date of birth is asked at sign-up; people under 18 can't make an account (checked in the app and here).
-- * age_confirmed_at records the "I confirm I am 18 or older and agree to the Terms" tick.
-- * Where you live (state + area), gender and what you do are optional profile details. Creators see them only
--   as group totals in Insights (never per person), and groups under 5 people are hidden.

alter table users add column if not exists date_of_birth date;
alter table users add column if not exists age_confirmed_at timestamptz;
alter table users add column if not exists home_state text;
alter table users add column if not exists home_area text;
alter table users add column if not exists gender text;
alter table users add column if not exists occupation text;

do $$ begin
  alter table users add constraint users_dob_sane check (date_of_birth is null or date_of_birth >= date '1900-01-01');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table users add constraint users_gender_known check (gender is null or gender in ('woman', 'man', 'other', 'prefer_not'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table users add constraint users_area_short check (char_length(coalesce(home_area, '')) <= 80 and char_length(coalesce(occupation, '')) <= 60);
exception when duplicate_object then null; end $$;

-- Under 18 can never be saved, whatever path writes the row.
create or replace function users_check_adult() returns trigger language plpgsql as $$
begin
  if new.date_of_birth is not null and new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'must be 18 or older';
  end if;
  return new;
end $$;
drop trigger if exists users_check_adult on users;
create trigger users_check_adult before insert or update of date_of_birth on users
  for each row execute function users_check_adult();

create index if not exists users_home_state_idx on users (home_state) where home_state is not null;
