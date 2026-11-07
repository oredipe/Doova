-- 017_notifications.sql
-- 7 Nov 2026. In-app notifications (the bell) and phone push.
-- Notifications are written by the database when things happen, so every path is covered
-- (app actions, webhooks, scheduled auto-approvals). The app shows them; a dispatcher sends pushes.
-- Repeats collapse into one unread item ("3 responses to review", "4 new tasks for you").

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,           -- paid, rejected, appeal_kept, review_waiting, task_live, task_turned_down,
                                         -- funds_added, payout_sent, payout_failed, new_task
  title         text not null,           -- the item it's about (task title, amount…)
  body          text,
  link          text not null,
  amount_kobo   bigint,
  count         integer not null default 1,
  collapse_key  text,                    -- same key + still unread = one item with a count
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  pushed_at     timestamptz              -- null = push not sent yet
);
create index notifications_user_recent on notifications (user_id, created_at desc);
create index notifications_unpushed on notifications (created_at) where pushed_at is null;
create unique index notifications_collapse on notifications (user_id, collapse_key) where read_at is null and collapse_key is not null;

create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_ok_at    timestamptz
);
create index push_subscriptions_user on push_subscriptions (user_id);

alter table users add column if not exists notify_push boolean not null default true;
alter table users add column if not exists notify_new_tasks boolean not null default true;

-- Secrets the app creates for itself (the phone-push key pair). Service role only, like everything else.
create table app_secrets (key text primary key, value text not null, created_at timestamptz not null default now());

insert into platform_settings (key, value, description) values
  ('site_url', '"https://doova-app.vercel.app"', 'Public address of the app; used for links and the push dispatcher. Change when the domain moves.'),
  ('push_dispatch_secret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')), 'Shared secret the database scheduler sends to the push dispatcher.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Writing notifications
-- ---------------------------------------------------------------------------
create or replace function notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text,
                                  p_amount bigint default null, p_collapse text default null) returns void
language plpgsql as $$
begin
  if p_user is null then return; end if;
  insert into notifications (user_id, kind, title, body, link, amount_kobo, collapse_key)
  values (p_user, p_kind, p_title, p_body, p_link, p_amount, p_collapse)
  on conflict (user_id, collapse_key) where read_at is null and collapse_key is not null do update
     set count = notifications.count + 1, title = excluded.title, body = excluded.body, link = excluded.link,
         amount_kobo = excluded.amount_kobo, created_at = now(),
         -- push again only if the last push for this item was a while ago
         pushed_at = case when notifications.pushed_at < now() - interval '3 hours' then null else notifications.pushed_at end;
end $$;

-- Who hears about a task as its creator: the person, or a business's owners and reviewers.
create or replace function task_creator_people(p_task uuid) returns setof uuid
language sql stable as $$
  select t.creator_id from tasks t where t.id = p_task and t.creator_type = 'user'
  union
  select m.user_id from tasks t join org_members m on m.org_id = t.creator_id
   where t.id = p_task and t.creator_type = 'org' and m.role in ('owner', 'reviewer')
$$;

-- Submissions: checked at the end of the transaction, so a response that is submitted and
-- auto-approved in one go only produces "paid", never "needs review".
create or replace function notify_submission() returns trigger
language plpgsql as $$
declare s submissions%rowtype; t tasks%rowtype; a appeals%rowtype; who uuid;
begin
  select * into s from submissions where id = new.id;
  -- act once, for the update that set the status the row ends the transaction with
  if not found or new.status is distinct from s.status or new.status is not distinct from old.status then return null; end if;
  select * into t from tasks where id = s.task_id;
  if s.status = 'approved' then
    select * into a from appeals where submission_id = s.id;
    perform notify(s.doer_id, 'paid', t.title,
      case when a.status = 'upheld_for_doer' then 'Doova staff agreed with your appeal.' else null end,
      '/tasks/' || t.id || '/done', t.reward_kobo);
  elsif s.status = 'rejected' then
    perform notify(s.doer_id, 'rejected', t.title, s.reject_reason, '/tasks/' || t.id || '/done');
  elsif s.status = 'rejected_final' and old.status = 'appealed' then
    select * into a from appeals where submission_id = s.id;
    perform notify(s.doer_id, 'appeal_kept', t.title, a.decision_note, '/tasks/' || t.id || '/done');
  elsif s.status = 'submitted' then
    for who in select task_creator_people(t.id) loop
      perform notify(who, 'review_waiting', t.title, null, '/create/tasks/' || t.id, null, 'review:' || t.id);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists submissions_notify on submissions;
create constraint trigger submissions_notify after update of status on submissions
  deferrable initially deferred for each row execute function notify_submission();

-- Tasks: live (creator + matching doers), or turned down by Doova.
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
    -- doers who can do it (level allows the reward, not the creator's side, alerts on)
    insert into notifications (user_id, kind, title, body, link, amount_kobo, collapse_key)
    select u.id, 'new_task', t.title, null, '/tasks/' || t.id, t.reward_kobo, 'new_tasks'
      from users u
      left join doer_levels l on l.level = u.level
     where u.status = 'active' and not u.staff_only and u.phone is not null and u.notify_new_tasks
       and (l.max_reward_kobo is null or l.max_reward_kobo >= t.reward_kobo)
       and (not t.needs_laptop or coalesce(l.laptop_tasks, false))
       and u.id not in (select task_creator_people(t.id))
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

drop trigger if exists tasks_notify on tasks;
create constraint trigger tasks_notify after update on tasks
  deferrable initially deferred for each row execute function notify_task();

-- Money in (creator account numbers, test money) and money out.
create or replace function notify_payment() returns trigger
language plpgsql as $$
begin
  if new.status = 'succeeded' and new.owner_type = 'user' then
    perform notify(new.owner_id, 'funds_added', 'Creator funds', null, '/create/wallet', new.net_kobo);
  end if;
  return null;
end $$;
drop trigger if exists payments_notify on payments;
create trigger payments_notify after insert on payments for each row execute function notify_payment();

create or replace function notify_payout() returns trigger
language plpgsql as $$
declare link text := case when new.purse = 'funds' then '/create/wallet' else '/wallet' end;
begin
  if new.owner_type <> 'user' or new.status is not distinct from old.status then return null; end if;
  if new.status = 'succeeded' then
    perform notify(new.owner_id, 'payout_sent', 'Withdrawal', null, link, new.transfer_kobo);
  elsif new.status = 'failed' then
    perform notify(new.owner_id, 'payout_failed', 'Withdrawal', new.failure_reason, link, new.amount_kobo);
  end if;
  return null;
end $$;
drop trigger if exists payouts_notify on payouts;
create trigger payouts_notify after update of status on payouts for each row execute function notify_payout();

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
create or replace function mark_notifications_read(p_user uuid) returns void
language sql as $$
  update notifications set read_at = now() where user_id = p_user and read_at is null;
$$;

-- Old read notifications are cleared after 60 days (daily job).
create or replace function purge_old_notifications() returns void
language sql as $$
  delete from notifications where read_at < now() - interval '60 days';
  delete from notifications where created_at < now() - interval '120 days';
$$;

-- ---------------------------------------------------------------------------
-- Push dispatch: every minute the scheduler pokes the app's dispatcher, but only when something
-- is waiting. (The app also sends straight away after its own actions.)
-- ---------------------------------------------------------------------------
create or replace function push_dispatch_tick() returns void
language plpgsql as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from notifications where pushed_at is null and created_at > now() - interval '1 hour') then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  select value #>> '{}' into v_url from platform_settings where key = 'site_url';
  select value #>> '{}' into v_secret from platform_settings where key = 'push_dispatch_secret';
  execute 'select net.http_post(url := $1, headers := $2, body := $3)'
    using v_url || '/api/push/dispatch', jsonb_build_object('x-dispatch-secret', v_secret, 'content-type', 'application/json'), '{}'::jsonb;
end $$;

do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not available here; pushes go out from the app only';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('doova-push', '* * * * *', 'select public.push_dispatch_tick()');
    perform cron.schedule('doova-notifications-cleanup', '20 23 * * *', 'select public.purge_old_notifications()');
  end if;
end $$;

alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table app_secrets enable row level security;
revoke all on notifications, push_subscriptions, app_secrets from anon, authenticated, public;
grant all on notifications, push_subscriptions, app_secrets to service_role;
revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
