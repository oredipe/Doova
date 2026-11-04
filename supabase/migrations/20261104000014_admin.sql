-- 014_admin.sql
-- What the admin dashboard needs (Step 4, 4 Nov 2026): adding staff, the moderation note the
-- creator sees, suspending people, the daily money check, a few switches, and money totals.
-- Every staff action goes through a staff_* function that checks the role and logs it by name.

-- Owners manage staff and switches.
create or replace function staff_can(p_user uuid, p_action text) returns boolean
language sql stable as $$
  select exists (
    select 1 from staff_members m
     where m.user_id = p_user and m.active
       and (m.role = 'owner'
         or (m.role = 'moderator' and p_action in ('task.moderate', 'appeal.decide', 'user.suspend', 'user.view', 'rating.hide', 'chat.reply'))
         or (m.role = 'finance'   and p_action in ('payout.retry', 'reconcile', 'refund', 'user.view', 'money.view'))
         or (m.role = 'support'   and p_action in ('chat.reply', 'user.view'))))
$$;

-- ---------------------------------------------------------------------------
-- Staff. The first owner is added once from the SQL editor:
--   select add_staff_member(null, '+2348012345678', 'owner', 'you@example.com');
-- After that only an owner can add staff (from Settings in the dashboard).
-- ---------------------------------------------------------------------------
create or replace function add_staff_member(p_by uuid, p_phone text, p_role staff_role, p_email text)
returns uuid language plpgsql as $$
declare v_user uuid;
begin
  if p_by is null then
    if exists (select 1 from staff_members where role = 'owner' and active) then
      raise exception 'an owner already exists; add staff from the dashboard';
    end if;
    if p_role <> 'owner' then raise exception 'the first staff member must be an owner'; end if;
  elsif not staff_can(p_by, 'staff.manage') then
    raise exception 'only an owner can add staff';
  end if;
  select id into v_user from users where phone = p_phone;
  if v_user is null then raise exception 'no Doova account uses %; sign up in the app first', p_phone; end if;
  if coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'enter a valid email'; end if;

  insert into staff_members (user_id, role, email, active, added_by)
  values (v_user, p_role, lower(btrim(p_email)), true, p_by)
  on conflict (user_id) do update set role = excluded.role, email = excluded.email, active = true;

  insert into staff_activity (staff_id, action, target_type, target_id, detail)
  values (coalesce(p_by, v_user), 'staff.add', 'user', v_user::text, jsonb_build_object('role', p_role, 'email', lower(btrim(p_email))));
  return v_user;
end $$;

create or replace function staff_set_active(p_by uuid, p_user uuid, p_active boolean) returns void
language plpgsql as $$
begin
  if not staff_can(p_by, 'staff.manage') then raise exception 'only an owner can change staff'; end if;
  if p_by = p_user and not p_active then raise exception 'you cannot remove yourself'; end if;
  update staff_members set active = p_active where user_id = p_user;
  perform log_staff_action(p_by, case when p_active then 'staff.restore' else 'staff.remove' end, 'user', p_user::text);
end $$;

-- ---------------------------------------------------------------------------
-- Task moderation: keep the note so the creator sees why.
-- ---------------------------------------------------------------------------
alter table tasks add column if not exists moderation_note text;
alter table tasks add column if not exists moderated_by uuid references users(id);
alter table tasks add column if not exists moderated_at timestamptz;

create or replace function staff_moderate_task(p_staff uuid, p_task uuid, p_approve boolean, p_note text default null)
returns void language plpgsql as $$
begin
  if not staff_can(p_staff, 'task.moderate') then raise exception 'your role cannot approve tasks'; end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then raise exception 'say why the task was turned down'; end if;
  perform moderate_task(p_task, p_approve, p_note);
  update tasks set moderation_note = nullif(btrim(p_note), ''), moderated_by = p_staff, moderated_at = now() where id = p_task;
  perform log_staff_action(p_staff, case when p_approve then 'task.approve' else 'task.reject' end,
                           'task', p_task::text, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Suspending a person stops them starting tasks and signing in to the app.
-- ---------------------------------------------------------------------------
create or replace function staff_set_user_status(p_staff uuid, p_user uuid, p_suspend boolean, p_note text)
returns void language plpgsql as $$
begin
  if not staff_can(p_staff, 'user.suspend') then raise exception 'your role cannot suspend accounts'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'say why'; end if;
  if p_staff = p_user then raise exception 'you cannot suspend yourself'; end if;
  update users set status = case when p_suspend then 'suspended'::user_status else 'active'::user_status end,
                   updated_at = now()
   where id = p_user and status <> 'deleted';
  if not found then raise exception 'account not found'; end if;
  perform log_staff_action(p_staff, case when p_suspend then 'user.suspend' else 'user.restore' end,
                           'user', p_user::text, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Daily money check: staff enter the customer-funds statement balance.
-- ---------------------------------------------------------------------------
alter table reconciliations add column if not exists note text;
alter table reconciliations add column if not exists checked_by uuid references users(id);

create or replace function staff_reconcile(p_staff uuid, p_provider payment_provider, p_date date,
                                           p_statement_kobo bigint, p_note text default null)
returns bigint language plpgsql as $$
declare v_diff bigint;
begin
  if not staff_can(p_staff, 'reconcile') then raise exception 'your role cannot run the money check'; end if;
  v_diff := reconcile_custody(p_provider, p_date, p_statement_kobo);
  update reconciliations set note = nullif(btrim(p_note), ''), checked_by = p_staff
   where provider = p_provider and statement_date = p_date;
  perform log_staff_action(p_staff, 'money.check', 'reconciliation', p_provider || ':' || p_date,
                           jsonb_build_object('statement_kobo', p_statement_kobo, 'difference_kobo', v_diff, 'note', p_note));
  return v_diff;
end $$;

-- A difference can be explained later (the row keeps the numbers).
create or replace function staff_explain_reconciliation(p_staff uuid, p_id bigint, p_note text) returns void
language plpgsql as $$
begin
  if not staff_can(p_staff, 'reconcile') then raise exception 'your role cannot run the money check'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'write the explanation'; end if;
  update reconciliations set note = btrim(p_note) where id = p_id;
  perform log_staff_action(p_staff, 'money.explain', 'reconciliation', p_id::text, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Switches an owner can flip from the dashboard (others stay in SQL for now).
-- ---------------------------------------------------------------------------
create or replace function staff_set_switch(p_staff uuid, p_key text, p_on boolean) returns void
language plpgsql as $$
declare v_old jsonb;
begin
  if not staff_can(p_staff, 'settings.update') then raise exception 'only an owner can change settings'; end if;
  if p_key not in ('pilot_all_tasks_need_approval', 'withdrawals_paused') then
    raise exception 'this setting cannot be changed here';
  end if;
  select value into v_old from platform_settings where key = p_key for update;
  update platform_settings set value = to_jsonb(p_on), updated_at = now() where key = p_key;
  perform log_staff_action(p_staff, 'settings.update', 'setting', p_key, jsonb_build_object('from', v_old, 'to', p_on));
end $$;

-- ---------------------------------------------------------------------------
-- Money totals for the dashboard, one row per bucket.
-- ---------------------------------------------------------------------------
create or replace view v_money_totals as
select case
         when type = 'user_wallet' and owner_type = 'org'      then 'business_funds'
         when type = 'user_wallet' and code like '%:earnings'  then 'earnings'
         when type = 'user_wallet'                             then 'creator_funds'
         when type = 'bank_custody'                            then 'custody_' || provider
         else type::text
       end as bucket,
       sum(balance_kobo)::bigint as balance_kobo,
       count(*)::int as accounts
  from ledger_accounts
 group by 1;

-- ---------------------------------------------------------------------------
-- Overview numbers since a moment (the start of today in Lagos), and rewards funded per day.
-- ---------------------------------------------------------------------------
create or replace function admin_numbers_since(p_since timestamptz) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'funded_kobo',   (select coalesce(sum(escrow_kobo), 0) from tasks where funded_at >= p_since),
    'funded_tasks',  (select count(*) from tasks where funded_at >= p_since),
    'paid_kobo',     (select coalesce(sum(e.amount_kobo), 0) from ledger_entries e join ledger_transactions t on t.id = e.transaction_id
                       where t.kind = 'release_reward' and e.direction = 'credit' and t.created_at >= p_since),
    'paid_count',    (select count(*) from ledger_transactions where kind = 'release_reward' and created_at >= p_since),
    'withdrawn_kobo',(select coalesce(sum(amount_kobo), 0) from payouts where requested_at >= p_since),
    'withdrawals',   (select count(*) from payouts where requested_at >= p_since),
    'signups',       (select count(*) from users where created_at >= p_since),
    'nin_checks',    (select count(*) from users where kyc_verified_at >= p_since),
    'fees_kobo',     (select coalesce(sum(case when e.direction = 'credit' then e.amount_kobo else -e.amount_kobo end), 0)
                        from ledger_entries e join ledger_accounts a on a.id = e.account_id
                       where a.type = 'platform_revenue' and e.created_at >= p_since)
  )
$$;

create or replace function admin_funded_by_day(p_days integer default 7)
returns table (day date, funded_kobo bigint)
language sql stable as $$
  select d::date, coalesce((select sum(escrow_kobo) from tasks where lagos_day(funded_at) = d::date), 0)::bigint
    from generate_series(lagos_day(now()) - (p_days - 1), lagos_day(now()), interval '1 day') d
   order by 1
$$;

revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
revoke all on v_money_totals from anon, authenticated, public;
grant select on v_money_totals to service_role;
