-- 010_staff_and_devices.sql
-- Doova staff (admin dashboard), the staff activity log, and laptop sign-in by
-- scanning a code with the signed-in phone (decided 3–4 Nov 2026).

-- ---------------------------------------------------------------------------
-- Staff. Staff sign in with email, password and an authenticator app (no SMS).
-- Every staff action is logged by name.
-- ---------------------------------------------------------------------------
create table staff_members (
  user_id      uuid primary key references users(id),
  role         staff_role not null,
  email        citext unique not null,
  active       boolean not null default true,
  added_by     uuid references users(id),
  added_at     timestamptz not null default now()
);

create table staff_activity (
  id           bigint generated always as identity primary key,
  staff_id     uuid not null references users(id),
  action       text not null,                -- 'task.approve', 'appeal.decide', 'settings.update' …
  target_type  text,
  target_id    text,
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index staff_activity_recent_idx on staff_activity (created_at desc);
create index staff_activity_target_idx on staff_activity (target_type, target_id);

-- The log is insert-only.
create or replace function staff_activity_forbid_change() returns trigger
language plpgsql as $$ begin raise exception 'the activity log cannot be changed'; end $$;
create trigger staff_activity_insert_only before update or delete on staff_activity
  for each row execute function staff_activity_forbid_change();

create or replace function staff_can(p_user uuid, p_action text) returns boolean
language sql stable as $$
  select exists (
    select 1 from staff_members m
     where m.user_id = p_user and m.active
       and (m.role = 'owner'
         or (m.role = 'moderator' and p_action in ('task.moderate', 'appeal.decide', 'user.suspend', 'rating.hide', 'chat.reply'))
         or (m.role = 'finance'   and p_action in ('payout.retry', 'reconcile', 'refund'))
         or (m.role = 'support'   and p_action in ('chat.reply', 'user.view'))))
$$;

create or replace function log_staff_action(p_staff uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}')
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  if not exists (select 1 from staff_members where user_id = p_staff and active) then
    raise exception 'only active staff can act here';
  end if;
  insert into staff_activity (staff_id, action, target_type, target_id, detail)
  values (p_staff, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'))
  returning id into v_id;
  return v_id;
end $$;

-- Moderation by a named staff member: checks the role, decides, and logs it.
create or replace function staff_moderate_task(p_staff uuid, p_task uuid, p_approve boolean, p_note text default null)
returns void language plpgsql as $$
begin
  if not staff_can(p_staff, 'task.moderate') then raise exception 'your role cannot approve tasks'; end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then raise exception 'say why the task was turned down'; end if;
  perform moderate_task(p_task, p_approve, p_note);
  perform log_staff_action(p_staff, case when p_approve then 'task.approve' else 'task.reject' end,
                           'task', p_task::text, jsonb_build_object('note', p_note));
end $$;

create or replace function staff_decide_appeal(p_staff uuid, p_appeal uuid, p_for_doer boolean, p_note text)
returns void language plpgsql as $$
begin
  if not staff_can(p_staff, 'appeal.decide') then raise exception 'your role cannot decide appeals'; end if;
  perform decide_appeal(p_appeal, p_staff, p_for_doer, p_note);
  perform log_staff_action(p_staff, 'appeal.decide', 'appeal', p_appeal::text,
                           jsonb_build_object('for_doer', p_for_doer, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Laptop sign-in: the laptop shows a code; the signed-in phone scans it and taps
-- Approve. The code expires after 2 minutes and works once. "Shared or cyber café
-- computer" signs the laptop out after 30 minutes idle.
-- ---------------------------------------------------------------------------
create table device_logins (
  id              uuid primary key default gen_random_uuid(),
  code_hash       text not null unique,          -- sha256 of the random code in the QR
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '2 minutes',
  user_agent      text,
  ip_address      inet,
  approved_by     uuid references users(id),
  approved_at     timestamptz,
  shared_computer boolean not null default false,
  consumed_at     timestamptz
);
create index device_logins_open_idx on device_logins (expires_at) where consumed_at is null;

create or replace function approve_device_login(p_code text, p_user uuid, p_shared boolean)
returns uuid language plpgsql as $$
declare d device_logins%rowtype;
begin
  select * into d from device_logins where code_hash = encode(digest(p_code, 'sha256'), 'hex') for update;
  if not found then raise exception 'this code is not valid'; end if;
  if d.expires_at <= now() then raise exception 'this code has expired; refresh it on the laptop'; end if;
  if d.approved_at is not null then raise exception 'this code was already used'; end if;
  update device_logins set approved_by = p_user, approved_at = now(), shared_computer = p_shared where id = d.id;
  return d.id;
end $$;

-- The laptop polls with its code; returns the approving user once, then never again.
create or replace function consume_device_login(p_code text)
returns table (user_id uuid, shared_computer boolean) language plpgsql as $$
declare d device_logins%rowtype;
begin
  select * into d from device_logins where code_hash = encode(digest(p_code, 'sha256'), 'hex') for update;
  if not found or d.approved_at is null or d.consumed_at is not null or d.expires_at <= now() - interval '1 minute' then
    return;
  end if;
  update device_logins set consumed_at = now() where id = d.id;
  user_id := d.approved_by; shared_computer := d.shared_computer;
  return next;
end $$;
