-- 008_ratings.sql
-- Two-way 5-star ratings on approved work (decided 20 Oct 2026).
--
--   * The doer rates the creator; someone who can review the task rates the doer.
--   * Only approved submissions can be rated, within 7 days of approval.
--   * One rating per side per submission, final once given.
--   * 1 or 2 stars needs a comment (the same rule as "no reason, no rejection").
--   * Blind: a rating stays hidden until the other side has rated, or 72 hours
--     after approval, so neither side can rate in revenge.
--   * Staff can hide an abusive rating; hidden ratings never count.

insert into platform_settings (key, value, description) values
  ('rating_window_hours',  '168', 'How long after approval either side may rate: 7 days.'),
  ('rating_reveal_hours',  '72',  'A rating is shown after this long even if the other side has not rated.'),
  ('rating_min_to_show',   '3',   'Averages are shown only once this many ratings are visible; before that, show "New".')
on conflict (key) do nothing;

create table ratings (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references submissions(id),
  rater_role      text not null check (rater_role in ('doer', 'creator')),
  rater_user_id   uuid not null references users(id),
  -- who is being rated
  ratee_type      owner_kind not null,
  ratee_id        uuid not null,
  stars           smallint not null check (stars between 1 and 5),
  comment         text check (comment is null or length(comment) <= 300),
  hidden          boolean not null default false,       -- staff moderation
  hidden_reason   text,
  created_at      timestamptz not null default now(),
  unique (submission_id, rater_role),
  check (stars >= 3 or (comment is not null and length(btrim(comment)) >= 10))
);
create index ratings_ratee_idx on ratings (ratee_type, ratee_id) where not hidden;

-- Ratings are final: no edits, no deletes (staff hide instead).
create or replace function ratings_forbid_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'ratings cannot be deleted; hide them instead'; end if;
  if new.stars <> old.stars or new.comment is distinct from old.comment
     or new.rater_user_id <> old.rater_user_id or new.submission_id <> old.submission_id then
    raise exception 'ratings are final once given';
  end if;
  return new;
end $$;
create trigger ratings_final before update or delete on ratings
  for each row execute function ratings_forbid_change();

-- Give a rating. p_rater is the user tapping the stars; the role is worked out from who they are.
create or replace function rate_submission(p_submission uuid, p_rater uuid, p_stars smallint, p_comment text default null)
returns uuid
language plpgsql as $$
declare
  s       submissions%rowtype;
  t       tasks%rowtype;
  v_role  text;
  v_id    uuid;
begin
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'stars must be between 1 and 5';
  end if;
  select * into s from submissions where id = p_submission;
  if not found then raise exception 'submission not found'; end if;
  if s.status <> 'approved' then raise exception 'only approved work can be rated'; end if;
  if s.reviewed_at + make_interval(hours => setting_int('rating_window_hours')::int) < now() then
    raise exception 'the rating window has closed';
  end if;
  select * into t from tasks where id = s.task_id;

  if p_rater = s.doer_id then
    v_role := 'doer';
  elsif can_review(t.id, p_rater) then
    v_role := 'creator';
  else
    raise exception 'user % took no part in this submission', p_rater;
  end if;

  insert into ratings (submission_id, rater_role, rater_user_id, ratee_type, ratee_id, stars, comment)
  values (p_submission, v_role, p_rater,
          case v_role when 'doer' then t.creator_type else 'user'::owner_kind end,
          case v_role when 'doer' then t.creator_id else s.doer_id end,
          p_stars, nullif(btrim(p_comment), ''))
  on conflict (submission_id, rater_role) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'you have already rated this'; end if;
  return v_id;
exception
  when check_violation then
    if p_stars < 3 then raise exception 'please say what went wrong when giving 1 or 2 stars'; end if;
    raise;
end $$;

-- A rating is visible once the other side has rated, or 72 hours after approval.
create or replace view v_visible_ratings as
select r.*
  from ratings r
  join submissions s on s.id = r.submission_id
 where not r.hidden
   and (exists (select 1 from ratings o where o.submission_id = r.submission_id and o.rater_role <> r.rater_role)
        or s.reviewed_at + make_interval(hours => setting_int('rating_reveal_hours')::int) <= now());

-- Averages for task cards and profiles. show_average is false until enough ratings are visible.
create or replace view v_rating_summary as
select ratee_type, ratee_id,
       case when bool_and(rater_role = 'doer') then 'creator' else 'doer' end as rated_as,
       count(*)                          as ratings,
       round(avg(stars)::numeric, 1)     as average,
       count(*) >= setting_int('rating_min_to_show') as show_average,
       count(*) filter (where stars = 5) as five, count(*) filter (where stars = 4) as four,
       count(*) filter (where stars = 3) as three, count(*) filter (where stars = 2) as two,
       count(*) filter (where stars = 1) as one
  from v_visible_ratings
 group by ratee_type, ratee_id, (rater_role = 'doer');
