-- Doova update, 10 Nov 2026: codes by email, a phone number needed to do tasks, one bank account per person.
-- Paste into a New query in the Supabase SQL editor and press Run. Safe to run more than once.

-- 020_email_codes.sql
-- 10 Nov 2026. Email codes (creators can sign up by email; anyone can reset by email), phone needed to do tasks,
-- one bank account per person.
-- * A Doova account now needs a phone number OR an email (admin-only staff need neither).
-- * Sign-ups by email get their profile row like phone sign-ups do.
-- * New-task alerts go to every finished account, not only ones with a phone number.
-- * A bank account can belong to one Doova account only.

alter table users drop constraint if exists users_phone_or_staff_only;
do $$ begin
  alter table users add constraint users_phone_or_email_or_staff check (phone is not null or email is not null or staff_only);
exception when duplicate_object then null; end $$;

drop function if exists create_user_profile(uuid, text, text, text);
create or replace function create_user_profile(p_id uuid, p_phone text, p_full_name text, p_policy_version text, p_email text default null)
returns void language plpgsql as $$
declare v_phone text := case when nullif(btrim(p_phone), '') is null then null
                             when p_phone like '+%' then p_phone else '+' || p_phone end;
        v_email text := nullif(lower(btrim(p_email)), '');
begin
  -- A sign-in email is checked by Supabase and unique there, so if another account has it, it's only
  -- an email they typed for payment receipts. The person who proved they own it keeps it.
  if v_email is not null then
    update users set email = null, updated_at = now() where email = v_email and id <> p_id;
  end if;
  insert into users (id, phone, email, full_name, privacy_consent_at, privacy_policy_version)
  values (p_id, v_phone, v_email, nullif(btrim(p_full_name), ''),
          case when p_policy_version is not null then now() end, p_policy_version)
  on conflict (id) do nothing;
end $$;

-- Phone sign-ups, and email sign-ups started from Doova's sign-up page (they carry app_mode).
-- Admin-only staff (created by email from the admin) still get no doer profile.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    execute $f$
      create or replace function public.handle_new_auth_user() returns trigger
      language plpgsql security definer set search_path = public as $b$
      begin
        if coalesce(new.phone, '') <> '' then
          perform public.create_user_profile(new.id, new.phone,
                                             new.raw_user_meta_data ->> 'full_name',
                                             new.raw_user_meta_data ->> 'policy_version');
        elsif coalesce(new.email, '') <> '' and new.raw_user_meta_data ? 'app_mode' then
          perform public.create_user_profile(new.id, null,
                                             new.raw_user_meta_data ->> 'full_name',
                                             new.raw_user_meta_data ->> 'policy_version',
                                             new.email);
        end if;
        return new;
      end $b$;
    $f$;
    execute 'revoke all on function public.handle_new_auth_user() from anon, authenticated, public';
  end if;
end $$;

create or replace function notify_task() returns trigger
language plpgsql as $$
declare t tasks%rowtype; who uuid;
begin
  select * into t from tasks where id = new.id;
  if not found then return null; end if;
  -- judge each change by its own before/after values (a task can be funded and approved in one transaction)
  if new.went_live_at is not null and old.went_live_at is null then
    for who in select task_creator_people(t.id) loop
      perform notify(who, 'task_live', t.title, null, '/create/tasks/' || t.id);
    end loop;
    -- doers who can do it (level allows the reward, not the creator's side, alerts on; no staff on Doova tasks)
    insert into notifications (user_id, kind, title, body, link, amount_kobo, collapse_key)
    select u.id, 'new_task', t.title, null, '/tasks/' || t.id, t.reward_kobo, 'new_tasks'
      from users u
      left join doer_levels l on l.level = u.level
     where u.status = 'active' and not u.staff_only and u.full_name is not null and u.notify_new_tasks
       and (l.max_reward_kobo is null or l.max_reward_kobo >= t.reward_kobo)
       and (not t.needs_laptop or coalesce(l.laptop_tasks, false))
       and u.id not in (select task_creator_people(t.id))
       and not (t.is_doova and exists (select 1 from staff_members m where m.user_id = u.id and m.active))
    on conflict (user_id, collapse_key) where read_at is null and collapse_key is not null do update
       set count = notifications.count + 1, title = excluded.title, link = '/tasks', amount_kobo = excluded.amount_kobo,
           created_at = now(),
           pushed_at = case when notifications.pushed_at < now() - interval '3 hours' then null else notifications.pushed_at end;
  elsif new.moderated_at is not null and old.moderated_at is null and t.went_live_at is null then
    for who in select task_creator_people(t.id) loop
      perform notify(who, 'task_turned_down', t.title, t.moderation_note, '/create/tasks/' || t.id);
    end loop;
  end if;
  return null;
end $$;

-- One bank account, one Doova account (on top of one NIN per account).
create or replace function save_bank_account(p_owner_type owner_kind, p_owner_id uuid, p_by uuid,
  p_bank_code text, p_bank_name text, p_account_number text, p_account_name text, p_recipient_code text default null)
returns uuid language plpgsql as $$
declare v_name text; v_id uuid;
begin
  if p_owner_type = 'user' then
    if p_by <> p_owner_id then raise exception 'you can only add your own bank account'; end if;
    select legal_name into v_name from users where id = p_owner_id and kyc_tier >= 1;
    if v_name is null then raise exception 'check your NIN before adding a bank account'; end if;
    if exists (select 1 from bank_accounts where owner_type = 'user' and owner_id <> p_owner_id
                 and bank_code = p_bank_code and account_number = p_account_number) then
      raise exception 'this bank account is already linked to another Doova account';
    end if;
  else
    if not exists (select 1 from org_members where org_id = p_owner_id and user_id = p_by and role = 'owner') then
      raise exception 'only the business owner can add a bank account';
    end if;
    select name into v_name from organizations where id = p_owner_id;
  end if;
  if not names_match(p_account_name, v_name) then
    raise exception 'the account name % does not match %', p_account_name, v_name;
  end if;
  update bank_accounts set is_default = false where owner_type = p_owner_type and owner_id = p_owner_id;
  insert into bank_accounts (owner_type, owner_id, bank_code, bank_name, account_number, account_name,
                             name_matched, verified_at, is_default, recipient_code)
  values (p_owner_type, p_owner_id, p_bank_code, p_bank_name, p_account_number, p_account_name, true, now(), true, p_recipient_code)
  on conflict (owner_type, owner_id, bank_code, account_number) do update
     set account_name = excluded.account_name, bank_name = excluded.bank_name, name_matched = true,
         verified_at = now(), is_default = true, recipient_code = coalesce(excluded.recipient_code, bank_accounts.recipient_code)
  returning id into v_id;
  return v_id;
end $$;

-- Doing tasks needs a checked phone number (one SIM, one doer). Accounts made by email can post
-- tasks straight away, and add a phone number before they do any.
create or replace function submissions_need_phone() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from users u where u.id = new.doer_id and u.phone is not null) then
    raise exception 'add your phone number before doing tasks';
  end if;
  return new;
end $$;
drop trigger if exists submissions_need_phone on submissions;
create trigger submissions_need_phone before insert on submissions
  for each row execute function submissions_need_phone();

revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
