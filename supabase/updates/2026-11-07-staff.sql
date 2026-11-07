-- Doova update, 7 Nov 2026: staff can't decide on their own tasks or work, and admin-only staff accounts.
-- Paste all of this into a New query in the Supabase SQL editor and press Run (choose "Run without RLS" if asked).
-- Running it twice does no harm.

-- 016_staff_separation.sql
-- 7 Nov 2026. (1) Staff never decide on their own work: no approving a task they (or a business they
-- belong to) posted, no deciding an appeal where they are the doer or the task's creator.
-- (2) Admin-only staff accounts: an email-only account used just for admin, not tied to a phone or a
-- doer/creator account. Staff can still be added from an existing Doova account (by phone).

-- ---------------------------------------------------------------------------
-- (1) Conflicts of interest
-- ---------------------------------------------------------------------------
create or replace function staff_conflict(p_staff uuid, p_task uuid, p_doer uuid default null) returns boolean
language sql stable as $$
  select coalesce(p_staff = p_doer, false)
      or exists (select 1 from tasks t where t.id = p_task and (
            (t.creator_type = 'user' and t.creator_id = p_staff)
         or t.created_by_user_id = p_staff
         or (t.creator_type = 'org' and exists (select 1 from org_members m where m.org_id = t.creator_id and m.user_id = p_staff))))
$$;

create or replace function staff_moderate_task(p_staff uuid, p_task uuid, p_approve boolean, p_note text default null)
returns void language plpgsql as $$
begin
  if not staff_can(p_staff, 'task.moderate') then raise exception 'your role cannot approve tasks'; end if;
  if staff_conflict(p_staff, p_task) then raise exception 'you cannot decide on your own task; another staff member must'; end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then raise exception 'say why the task was turned down'; end if;
  perform moderate_task(p_task, p_approve, p_note);
  update tasks set moderation_note = nullif(btrim(p_note), ''), moderated_by = p_staff, moderated_at = now() where id = p_task;
  perform log_staff_action(p_staff, case when p_approve then 'task.approve' else 'task.reject' end,
                           'task', p_task::text, jsonb_build_object('note', p_note));
end $$;

create or replace function staff_decide_appeal(p_staff uuid, p_appeal uuid, p_for_doer boolean, p_note text)
returns void language plpgsql as $$
declare v_task uuid; v_doer uuid;
begin
  if not staff_can(p_staff, 'appeal.decide') then raise exception 'your role cannot decide appeals'; end if;
  select s.task_id, s.doer_id into v_task, v_doer from appeals a join submissions s on s.id = a.submission_id where a.id = p_appeal;
  if staff_conflict(p_staff, v_task, v_doer) then raise exception 'you cannot decide an appeal on your own task or work; another staff member must'; end if;
  perform decide_appeal(p_appeal, p_staff, p_for_doer, p_note);
  perform log_staff_action(p_staff, 'appeal.decide', 'appeal', p_appeal::text,
                           jsonb_build_object('for_doer', p_for_doer, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- (2) Admin-only accounts. They have no phone, can't use the doer/creator app, and must change
-- the temporary password the owner gave them before doing anything in admin.
-- ---------------------------------------------------------------------------
alter table users alter column phone drop not null;
alter table users add column if not exists staff_only boolean not null default false;
do $$ begin
  alter table users add constraint users_phone_or_staff_only check (phone is not null or staff_only);
exception when duplicate_object then null; end $$;
alter table staff_members add column if not exists must_change_password boolean not null default false;

-- Called after the app has created the email sign-in (Supabase Auth) with id p_id.
create or replace function add_staff_only_account(p_by uuid, p_id uuid, p_email text, p_name text, p_role staff_role)
returns uuid language plpgsql as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_by is null then
    if exists (select 1 from staff_members where role = 'owner' and active) then
      raise exception 'an owner already exists; add staff from the dashboard';
    end if;
    if p_role <> 'owner' then raise exception 'the first staff member must be an owner'; end if;
  elsif not staff_can(p_by, 'staff.manage') then
    raise exception 'only an owner can add staff';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'enter a valid email'; end if;
  if coalesce(btrim(p_name), '') !~ '\s' then raise exception 'enter their first and last name'; end if;
  insert into users (id, phone, email, full_name, staff_only) values (p_id, null, v_email, btrim(p_name), true);
  insert into staff_members (user_id, role, email, active, added_by, must_change_password)
  values (p_id, p_role, v_email, true, p_by, true);
  insert into staff_activity (staff_id, action, target_type, target_id, detail)
  values (coalesce(p_by, p_id), 'staff.add', 'user', p_id::text, jsonb_build_object('role', p_role, 'email', v_email, 'admin_only', true));
  return p_id;
end $$;

create or replace function staff_password_changed(p_staff uuid) returns void
language plpgsql as $$
begin
  update staff_members set must_change_password = false where user_id = p_staff;
  perform log_staff_action(p_staff, 'staff.password', 'user', p_staff::text);
end $$;

-- Email-only (admin) sign-ins get no doer profile from the sign-up trigger; only phone sign-ins do.
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
        end if;
        return new;
      end $b$;
    $f$;
    execute 'revoke all on function public.handle_new_auth_user() from anon, authenticated, public';
  end if;
end $$;

revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
