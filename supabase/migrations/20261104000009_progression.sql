-- 009_progression.sql
-- Creator tiers and doer levels, XP, streaks, badges and invites (decided 4 Nov 2026).
--
-- Creator tiers show doers how a creator treats them. Spending never changes a tier.
-- Doer levels unlock better-paid tasks and new kinds of work. XP is never lost.
-- Cash bonuses (level, streak, invite) are designed but PAUSED until Doova raises
-- investment: setting 'doer_cash_bonuses_enabled' = false, and nothing here pays cash.
--
-- Both are recomputed once a day by run_daily_jobs(). Moving up is immediate;
-- moving down happens after 14 days in a row below the bar.

-- ---------------------------------------------------------------------------
-- Rules tables (admin Settings shows and edits these)
-- ---------------------------------------------------------------------------
create table creator_tiers (
  tier                  smallint primary key check (tier between 1 and 5),
  name                  text not null,
  max_slots             integer,                 -- null = no cap beyond the task maximum
  laptop_tasks          boolean not null,
  nda_tasks             boolean not null,
  min_completed_tasks   integer not null default 0,
  min_days_on_doova     integer not null default 0,
  min_rating            numeric(2,1),
  max_reject_pct        numeric(5,2),
  max_review_hours      numeric(6,2),
  max_appeals_lost_90d  integer,
  needs_identity_check  boolean not null default false,   -- NIN, or CAC for a business
  shown_first_in_feeds  boolean not null default false,
  invite_only           boolean not null default false
);

insert into creator_tiers values
  (1, 'New',      200,  false, false, 0,  0,  null, null, null, null, false, false, false),
  (2, 'Verified', 1000, true,  false, 1,  0,  null, null, null, null, true,  false, false),
  (3, 'Trusted',  5000, true,  true,  5,  30, 4.3,  10,   24,   null, true,  false, false),
  (4, 'Top',      5000, true,  true,  20, 90, 4.6,  5,    12,   1,    true,  true,  false),
  (5, 'Partner',  5000, true,  true,  20, 90, 4.6,  5,    12,   1,    true,  true,  true);

create table doer_levels (
  level                 smallint primary key check (level between 1 and 5),
  name                  text not null,
  min_xp                integer not null,
  max_reward_kobo       bigint,                  -- null = any reward
  kinds                 task_kind[] not null,     -- kinds of task unlocked at this level (cumulative below)
  laptop_tasks          boolean not null,
  nda_tasks             boolean not null,
  min_approval_pct      numeric(5,2),
  min_rating            numeric(2,1),
  min_approved_tasks    integer not null default 0,
  needs_nin             boolean not null default false,
  early_access_minutes  integer not null default 0
);

insert into doer_levels values
  (1, 'Starter', 0,    150000,  '{survey,review}',            false, false, null, null, 0,  false, 0),
  (2, 'Regular', 100,  300000,  '{survey,review,labelling}',  false, false, 80,   null, 0,  false, 0),
  (3, 'Skilled', 400,  500000,  '{survey,review,labelling,app_test}', true, false, 85, null, 0, true, 0),
  (4, 'Pro',     1000, 1000000, '{survey,review,labelling,app_test,other}', true, false, 90, 4.5, 0, true, 30),
  (5, 'Expert',  2500, null,    '{survey,review,labelling,app_test,other}', true, true,  95, 4.7, 50, true, 30);

insert into platform_settings (key, value, description) values
  ('level_check_days',        '30',  'Doer levels are checked against the last 30 days.'),
  ('tier_check_days',         '90',  'Creator tiers are checked against the last 90 days.'),
  ('days_below_before_drop',  '14',  'Days in a row below the bar before moving down one level or tier.'),
  ('xp_per_naira_50',         '1',   'XP: 1 point for every ₦50 of an approved task''s reward.'),
  ('xp_task_max',             '80',  'XP: most one approved task can give.'),
  ('xp_five_star',            '10',  'XP for a 5-star rating from a creator.'),
  ('xp_streak_day',           '5',   'XP for each day of a streak.'),
  ('xp_invite',               '50',  'XP when an invited friend qualifies.'),
  ('streak_tasks_per_day',    '2',   'Tasks a doer submits in a day to keep a streak.'),
  ('invite_qualify_tasks',    '5',   'An invite qualifies when the friend verifies NIN and has this many approved tasks.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- State on people and businesses
-- ---------------------------------------------------------------------------
alter table users
  add column level                  smallint not null default 1 check (level between 1 and 5),
  add column xp                     integer  not null default 0 check (xp >= 0),
  add column level_below_since      date,
  add column streak_days            integer  not null default 0,
  add column streak_best            integer  not null default 0,
  add column streak_last_date       date,
  add column creator_tier           smallint not null default 1 check (creator_tier between 1 and 5),
  add column creator_tier_since     timestamptz not null default now(),
  add column creator_tier_below_since date,
  add column creator_tier_frozen    boolean  not null default false,
  add column home_state             text,
  add column invited_by             uuid references users(id),
  add column app_mode               text not null default 'earn' check (app_mode in ('earn', 'create'));

alter table organizations
  add column creator_tier           smallint not null default 1 check (creator_tier between 1 and 5),
  add column creator_tier_since     timestamptz not null default now(),
  add column creator_tier_below_since date,
  add column creator_tier_frozen    boolean  not null default false;

alter table tasks add column went_live_at timestamptz;

create or replace function tasks_mark_live() returns trigger
language plpgsql as $$
begin
  if new.status = 'live' and new.went_live_at is null then new.went_live_at := now(); end if;
  return new;
end $$;
create trigger tasks_mark_live before insert or update of status on tasks
  for each row execute function tasks_mark_live();

create or replace function creator_tier_of(p_type owner_kind, p_id uuid) returns smallint
language sql stable as $$
  select case p_type when 'user' then (select creator_tier from users where id = p_id)
                     when 'org'  then (select creator_tier from organizations where id = p_id) end
$$;

-- ---------------------------------------------------------------------------
-- Rules enforced at funding time and when a doer starts a task
-- ---------------------------------------------------------------------------
create or replace function check_creator_tier_allows(t tasks) returns void
language plpgsql stable as $$
declare r creator_tiers%rowtype;
begin
  select * into r from creator_tiers where tier = creator_tier_of(t.creator_type, t.creator_id);
  if r.max_slots is not null and t.slots > r.max_slots then
    raise exception '% creators can post up to % slots a task', r.name, r.max_slots;
  end if;
  if t.needs_laptop and not r.laptop_tasks then
    raise exception 'laptop tasks open at the Verified tier';
  end if;
  if t.requires_nda and not r.nda_tasks then
    raise exception 'NDA tasks open at the Trusted tier';
  end if;
end $$;

create or replace function check_doer_level_allows(t tasks, u users) returns void
language plpgsql stable as $$
declare
  r      doer_levels%rowtype;
  v_kind boolean;
begin
  select * into r from doer_levels where level = u.level;
  if r.max_reward_kobo is not null and t.reward_kobo > r.max_reward_kobo then
    raise exception 'this task opens at a higher level';
  end if;
  if not (t.kind = any (r.kinds)) then raise exception 'this kind of task opens at a higher level'; end if;
  if t.needs_laptop and not r.laptop_tasks then raise exception 'laptop tasks open at Level 3'; end if;
  if t.requires_nda and not r.nda_tasks then raise exception 'NDA tasks open at Level 5'; end if;
  if t.went_live_at is not null and now() < t.went_live_at + interval '30 minutes' and r.early_access_minutes = 0 then
    raise exception 'this task opens to everyone 30 minutes after it goes live';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- XP (insert-only log; users.xp is the running total and never goes down)
-- ---------------------------------------------------------------------------
create table xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  kind        text not null check (kind in ('task', 'five_star', 'streak_day', 'invite', 'adjustment')),
  points      integer not null check (points > 0),
  source_id   uuid,                         -- submission, rating, user (invite) …
  source_day  date,                         -- streak day
  created_at  timestamptz not null default now(),
  unique (user_id, kind, source_id),
  unique (user_id, kind, source_day)
);
create index xp_events_user_idx on xp_events (user_id, created_at desc);

create or replace function award_xp(p_user uuid, p_kind text, p_points integer, p_source uuid default null, p_day date default null)
returns integer language plpgsql as $$
declare v_id uuid;
begin
  if p_points <= 0 then return 0; end if;
  insert into xp_events (user_id, kind, points, source_id, source_day)
  values (p_user, p_kind, p_points, p_source, p_day)
  on conflict do nothing returning id into v_id;
  if v_id is null then return 0; end if;
  update users set xp = xp + p_points, updated_at = now() where id = p_user;
  return p_points;
end $$;

-- Approved task → XP (1 per ₦50 of reward, at most 80).
create or replace function submissions_award_xp() returns trigger
language plpgsql as $$
declare v_reward bigint;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select reward_kobo into v_reward from tasks where id = new.task_id;
    perform award_xp(new.doer_id, 'task',
                     least((v_reward / 5000)::int * setting_int('xp_per_naira_50')::int, setting_int('xp_task_max')::int),
                     new.id);
    perform award_badges(new.doer_id);
  end if;
  return new;
end $$;
create trigger submissions_award_xp after update of status on submissions
  for each row execute function submissions_award_xp();

-- 5 stars from a creator → XP.
create or replace function ratings_award_xp() returns trigger
language plpgsql as $$
begin
  if new.rater_role = 'creator' and new.stars = 5 then
    perform award_xp(new.ratee_id, 'five_star', setting_int('xp_five_star')::int, new.id);
  end if;
  return new;
end $$;
create trigger ratings_award_xp after insert on ratings
  for each row execute function ratings_award_xp();

-- ---------------------------------------------------------------------------
-- Badges (no money)
-- ---------------------------------------------------------------------------
create table badges (
  code         text primary key,
  name         text not null,
  rule         text not null
);
insert into badges values
  ('first_task', 'First task',   'First approved task'),
  ('top_rated',  'Top rated',    '★ 4.8 or more from 20 or more ratings'),
  ('top20_state','Top 20 in your state', 'Most approved tasks in your state last month'),
  ('streak_7',   '7-day streak', '7 streak days in a row'),
  ('tasks_50',   '50 tasks',     '50 approved tasks'),
  ('inviter',    'Inviter',      '3 invited friends who qualify');

create table user_badges (
  user_id     uuid not null references users(id),
  badge_code  text not null references badges(code),
  earned_at   timestamptz not null default now(),
  detail      text,                         -- e.g. 'Lagos, October 2026'
  primary key (user_id, badge_code)
);

create or replace function award_badges(p_user uuid) returns void
language plpgsql as $$
declare
  v_approved integer;
  v_rating   record;
  u          users%rowtype;
begin
  select * into u from users where id = p_user;
  select count(*) into v_approved from submissions where doer_id = p_user and status = 'approved';
  if v_approved >= 1 then
    insert into user_badges (user_id, badge_code) values (p_user, 'first_task') on conflict do nothing;
  end if;
  if v_approved >= 50 then
    insert into user_badges (user_id, badge_code) values (p_user, 'tasks_50') on conflict do nothing;
  end if;
  select ratings, average into v_rating from v_rating_summary
   where ratee_type = 'user' and ratee_id = p_user and rated_as = 'doer';
  if found and v_rating.ratings >= 20 and v_rating.average >= 4.8 then
    insert into user_badges (user_id, badge_code) values (p_user, 'top_rated') on conflict do nothing;
  end if;
  if u.streak_best >= 7 then
    insert into user_badges (user_id, badge_code) values (p_user, 'streak_7') on conflict do nothing;
  end if;
  if (select count(*) from referrals where inviter_id = p_user and qualified_at is not null) >= 3 then
    insert into user_badges (user_id, badge_code) values (p_user, 'inviter') on conflict do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Invites: 50 XP when the friend verifies NIN and has 5 approved tasks
-- ---------------------------------------------------------------------------
create table referrals (
  invitee_id    uuid primary key references users(id),
  inviter_id    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  qualified_at  timestamptz,
  check (invitee_id <> inviter_id)
);
create index referrals_inviter_idx on referrals (inviter_id);

create or replace function qualify_referrals() returns integer
language plpgsql as $$
declare r record; n integer := 0;
begin
  for r in
    select f.invitee_id, f.inviter_id from referrals f join users u on u.id = f.invitee_id
     where f.qualified_at is null and u.kyc_tier >= 1
       and (select count(*) from submissions s where s.doer_id = f.invitee_id and s.status = 'approved')
           >= setting_int('invite_qualify_tasks')
  loop
    update referrals set qualified_at = now() where invitee_id = r.invitee_id;
    perform award_xp(r.inviter_id, 'invite', setting_int('xp_invite')::int, r.invitee_id);
    perform award_badges(r.inviter_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Streaks: a streak day = 2 tasks submitted that day (Lagos time). Days when
-- fewer than 2 tasks were open pause the streak instead of breaking it.
-- ---------------------------------------------------------------------------
create or replace function lagos_day(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Africa/Lagos')::date $$;

create or replace function update_streaks(p_day date) returns jsonb
language plpgsql as $$
declare
  v_open    integer;
  v_need    integer := setting_int('streak_tasks_per_day');
  v_kept    integer := 0;
  v_broken  integer := 0;
  v_paused  boolean;
  r         record;
begin
  select count(*) into v_open from tasks
   where went_live_at is not null
     and lagos_day(went_live_at) <= p_day
     and (closed_at is null or lagos_day(closed_at) >= p_day);
  v_paused := v_open < v_need;

  -- Doers who did enough today extend (or start) their streak.
  for r in
    select doer_id from submissions
     where submitted_at is not null and lagos_day(submitted_at) = p_day
     group by doer_id having count(*) >= v_need
  loop
    update users
       set streak_days = case when streak_last_date = p_day - 1 then streak_days + 1
                              when streak_last_date = p_day then streak_days
                              else 1 end,
           streak_last_date = p_day, updated_at = now()
     where id = r.doer_id;
    update users set streak_best = greatest(streak_best, streak_days) where id = r.doer_id;
    perform award_xp(r.doer_id, 'streak_day', setting_int('xp_streak_day')::int, null, p_day);
    perform award_badges(r.doer_id);
    v_kept := v_kept + 1;
  end loop;

  -- Everyone else with a running streak: pause (quiet day) or break.
  if v_paused then
    update users set streak_last_date = p_day
     where streak_days > 0 and streak_last_date = p_day - 1;
  else
    update users set streak_days = 0, updated_at = now()
     where streak_days > 0 and streak_last_date < p_day;
    get diagnostics v_broken = row_count;
  end if;
  return jsonb_build_object('day', p_day, 'kept', v_kept, 'broken', v_broken, 'paused', v_paused);
end $$;

-- ---------------------------------------------------------------------------
-- Daily level check for doers (last 30 days)
-- ---------------------------------------------------------------------------
create or replace function doer_stats(p_user uuid, p_days integer default 30)
returns table (approved_30d integer, decided_30d integer, approval_pct numeric, rating numeric, approved_total integer)
language sql stable as $$
  select
    count(*) filter (where s.status = 'approved' and s.reviewed_at >= now() - make_interval(days => p_days))::int,
    count(*) filter (where s.status in ('approved', 'rejected', 'rejected_final', 'appealed')
                       and s.reviewed_at >= now() - make_interval(days => p_days))::int,
    case when count(*) filter (where s.status in ('approved', 'rejected', 'rejected_final', 'appealed')
                                 and s.reviewed_at >= now() - make_interval(days => p_days)) = 0 then 100
         else round(100.0 * count(*) filter (where s.status = 'approved' and s.reviewed_at >= now() - make_interval(days => p_days))
                    / count(*) filter (where s.status in ('approved', 'rejected', 'rejected_final', 'appealed')
                                         and s.reviewed_at >= now() - make_interval(days => p_days)), 1) end,
    (select average from v_rating_summary where ratee_type = 'user' and ratee_id = p_user and rated_as = 'doer'),
    count(*) filter (where s.status = 'approved')::int
  from submissions s where s.doer_id = p_user
$$;

create or replace function eligible_level(p_user uuid) returns smallint
language plpgsql stable as $$
declare
  u   users%rowtype;
  st  record;
  r   doer_levels%rowtype;
  v   smallint := 1;
begin
  select * into u from users where id = p_user;
  select * into st from doer_stats(p_user, setting_int('level_check_days')::int);
  for r in select * from doer_levels order by level loop
    exit when u.xp < r.min_xp;
    exit when r.min_approval_pct is not null and st.approval_pct < r.min_approval_pct;
    exit when r.min_rating is not null and coalesce(st.rating, 0) < r.min_rating;
    exit when st.approved_total < r.min_approved_tasks;
    exit when r.needs_nin and u.kyc_tier < 1;
    v := r.level;
  end loop;
  return v;
end $$;

create or replace function recompute_levels(p_day date default lagos_day(now())) returns jsonb
language plpgsql as $$
declare
  u      record;
  v_e    smallint;
  v_up   integer := 0;
  v_down integer := 0;
  v_warn integer := 0;
  v_grace integer := setting_int('days_below_before_drop')::int;
begin
  for u in select id, level, level_below_since from users where status = 'active' loop
    v_e := eligible_level(u.id);
    if v_e >= u.level then
      if v_e > u.level then v_up := v_up + 1; end if;
      update users set level = v_e, level_below_since = null where id = u.id
        and (level <> v_e or level_below_since is not null);
    elsif u.level_below_since is null then
      update users set level_below_since = p_day where id = u.id;   -- warn today
      v_warn := v_warn + 1;
    elsif p_day - u.level_below_since >= v_grace then
      update users set level = level - 1,
                       level_below_since = case when v_e < level - 1 then p_day else null end
       where id = u.id;
      v_down := v_down + 1;
    end if;
  end loop;
  return jsonb_build_object('up', v_up, 'down', v_down, 'warned', v_warn);
end $$;

-- ---------------------------------------------------------------------------
-- Daily tier check for creators (last 90 days). Tier 5 is by invitation only.
-- ---------------------------------------------------------------------------
create or replace function creator_stats(p_type owner_kind, p_id uuid, p_days integer default 90)
returns table (completed_tasks integer, days_on_doova integer, rating numeric, reject_pct numeric,
               review_hours numeric, appeals_lost integer, identity_checked boolean)
language sql stable as $$
  with t as (
    select * from tasks where creator_type = p_type and creator_id = p_id
  ), s as (
    select s.* from submissions s join t on t.id = s.task_id
     where s.reviewed_at >= now() - make_interval(days => p_days)
  )
  select
    (select count(*) from t where t.status in ('closed', 'settled')
        and exists (select 1 from submissions x where x.task_id = t.id and x.status = 'approved'))::int,
    (select (now()::date - min(created_at)::date) from t)::int,
    (select average from v_rating_summary where ratee_type = p_type and ratee_id = p_id and rated_as = 'creator'),
    (select case when count(*) = 0 then 0
                 else round(100.0 * count(*) filter (where s.status in ('rejected', 'rejected_final', 'appealed')) / count(*), 1) end
       from s where (s.status = 'approved' and not s.auto_approved)
                 or s.status in ('rejected', 'rejected_final', 'appealed')),
    (select round(avg(extract(epoch from (s.reviewed_at - s.submitted_at)) / 3600)::numeric, 1)
       from s where not s.auto_approved and s.reviewed_at is not null),
    (select count(*) from appeals a join submissions x on x.id = a.submission_id join t on t.id = x.task_id
      where a.status = 'upheld_for_doer' and a.decided_at >= now() - interval '90 days')::int,
    case p_type when 'user' then (select kyc_tier >= 1 from users where id = p_id)
                when 'org'  then (select kyc_tier >= 1 from organizations where id = p_id) end
$$;

create or replace function eligible_creator_tier(p_type owner_kind, p_id uuid) returns smallint
language plpgsql stable as $$
declare
  st record;
  r  creator_tiers%rowtype;
  v  smallint := 1;
begin
  select * into st from creator_stats(p_type, p_id, setting_int('tier_check_days')::int);
  for r in select * from creator_tiers where not invite_only order by tier loop
    exit when st.completed_tasks < r.min_completed_tasks;
    exit when coalesce(st.days_on_doova, 0) < r.min_days_on_doova;
    exit when r.needs_identity_check and not coalesce(st.identity_checked, false);
    exit when r.min_rating is not null and coalesce(st.rating, 0) < r.min_rating;
    exit when r.max_reject_pct is not null and coalesce(st.reject_pct, 0) > r.max_reject_pct;
    exit when r.max_review_hours is not null and coalesce(st.review_hours, 0) > r.max_review_hours;
    exit when r.max_appeals_lost_90d is not null and st.appeals_lost > r.max_appeals_lost_90d;
    v := r.tier;
  end loop;
  return v;
end $$;

create or replace function recompute_creator_tiers(p_day date default lagos_day(now())) returns jsonb
language plpgsql as $$
declare
  c       record;
  v_e     smallint;
  v_cur   smallint;
  v_up    integer := 0;
  v_down  integer := 0;
  v_grace integer := setting_int('days_below_before_drop')::int;
begin
  for c in
    select 'user'::owner_kind as kind, id, creator_tier, creator_tier_below_since, creator_tier_frozen
      from users where exists (select 1 from tasks where creator_type = 'user' and creator_id = users.id)
    union all
    select 'org'::owner_kind, id, creator_tier, creator_tier_below_since, creator_tier_frozen from organizations
  loop
    continue when c.creator_tier_frozen;
    v_e := eligible_creator_tier(c.kind, c.id);
    -- Partners keep tier 5 while they stay above the Top bar.
    v_cur := case when c.creator_tier = 5 and v_e >= 4 then 5 else c.creator_tier end;
    if v_e >= v_cur or (c.creator_tier = 5 and v_e >= 4) then
      if v_e > v_cur then
        v_up := v_up + 1;
        perform set_creator_tier(c.kind, c.id, v_e, null);
      else
        perform set_creator_tier(c.kind, c.id, v_cur, null);
      end if;
    elsif c.creator_tier_below_since is null then
      perform set_creator_tier(c.kind, c.id, c.creator_tier, p_day);
    elsif p_day - c.creator_tier_below_since >= v_grace then
      perform set_creator_tier(c.kind, c.id, (c.creator_tier - 1)::smallint,
                               case when v_e < c.creator_tier - 1 then p_day else null end);
      v_down := v_down + 1;
    end if;
  end loop;
  return jsonb_build_object('up', v_up, 'down', v_down);
end $$;

create or replace function set_creator_tier(p_type owner_kind, p_id uuid, p_tier smallint, p_below date)
returns void language plpgsql as $$
begin
  if p_type = 'user' then
    update users set creator_tier_since = case when creator_tier <> p_tier then now() else creator_tier_since end,
                     creator_tier = p_tier, creator_tier_below_since = p_below
     where id = p_id;
  else
    update organizations set creator_tier_since = case when creator_tier <> p_tier then now() else creator_tier_since end,
                             creator_tier = p_tier, creator_tier_below_since = p_below
     where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Once a day, shortly after midnight Lagos time
-- ---------------------------------------------------------------------------
create or replace function run_daily_jobs(p_day date default lagos_day(now()) - 1) returns jsonb
language plpgsql as $$
begin
  return jsonb_build_object(
    'streaks',  update_streaks(p_day),
    'invites',  qualify_referrals(),
    'levels',   recompute_levels(p_day + 1),
    'tiers',    recompute_creator_tiers(p_day + 1),
    'purged',   purge_expired_responses());
end $$;

-- ---------------------------------------------------------------------------
-- Task feed: adds what the doer's task card shows (kind, time, laptop, creator, tier)
-- ---------------------------------------------------------------------------
create or replace view v_task_feed as
select t.id, t.title, t.category, t.reward_kobo, t.slots, t.ends_at, t.requires_nda,
       t.slots - (select count(*) from submissions s
                   where s.task_id = t.id
                     and submission_holds_slot(s.status, s.reserved_until, s.appeal_deadline)) as slots_left,
       t.kind, t.estimated_minutes, t.needs_laptop, t.went_live_at, t.instructions,
       t.creator_type, t.creator_id,
       coalesce(o.name, u.full_name, 'A Doova creator') as creator_name,
       coalesce(o.creator_tier, u.creator_tier) as creator_tier
  from tasks t
  left join users u on t.creator_type = 'user' and u.id = t.creator_id
  left join organizations o on t.creator_type = 'org' and o.id = t.creator_id
 where t.status = 'live' and t.ends_at > now() and (t.starts_at is null or t.starts_at <= now());
