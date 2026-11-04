-- 011_supabase_security.sql
-- How the database sits inside Supabase.
--
--  * Nobody reads or writes tables from the browser. Row level security is ON for
--    every table with no policies, and the public API roles (anon, authenticated)
--    have no rights on tables or functions. The Doova server talks to the database
--    with the service role, and always calls the workflow functions for money and status.
--  * A new Supabase Auth user (phone sign-up) gets a matching row in public.users.
--  * pg_cron runs run_scheduled_jobs() every minute and run_daily_jobs() at 00:10 Lagos time.
--
-- Locally (plain Postgres, for tests) the Supabase roles and the auth schema do not
-- exist; this migration creates stand-ins so the same files run everywhere.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Lock the public API out
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated, public;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- New sign-ups: Supabase Auth user → public.users row (same id)
-- ---------------------------------------------------------------------------
create or replace function create_user_profile(p_id uuid, p_phone text, p_full_name text, p_policy_version text)
returns void language plpgsql as $$
begin
  insert into users (id, phone, full_name, privacy_consent_at, privacy_policy_version)
  values (p_id,
          case when p_phone like '+%' then p_phone else '+' || p_phone end,
          nullif(btrim(p_full_name), ''),
          case when p_policy_version is not null then now() end,
          p_policy_version)
  on conflict (id) do nothing;
end $$;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    execute $f$
      create or replace function public.handle_new_auth_user() returns trigger
      language plpgsql security definer set search_path = public as $b$
      begin
        if new.phone is not null then
          perform public.create_user_profile(new.id, new.phone,
                                             new.raw_user_meta_data ->> 'full_name',
                                             new.raw_user_meta_data ->> 'policy_version');
        end if;
        return new;
      end $b$;
    $f$;
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created after insert on auth.users
               for each row execute function public.handle_new_auth_user()';
    execute 'revoke all on function public.handle_new_auth_user() from anon, authenticated, public';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduler (Supabase has pg_cron; skipped quietly where it is not installed)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available here; run run_scheduled_jobs() from the app instead';
    return;
  end;
  perform cron.schedule('doova-every-minute', '* * * * *', 'select public.run_scheduled_jobs()');
  perform cron.schedule('doova-daily', '10 23 * * *', 'select public.run_daily_jobs()');   -- 23:10 UTC = 00:10 Lagos
end $$;
