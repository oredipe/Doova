-- 003_tasks.sql
-- Templates, NDAs, tasks, submissions, proof files and appeals.

create table task_templates (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  category                task_category not null,
  description             text not null,
  form_schema             jsonb not null,          -- questions / fields the doer fills in
  default_proof_type      proof_type not null,
  default_review_mode     review_mode not null,
  suggested_reward_kobo   bigint not null check (suggested_reward_kobo >= 50000),
  is_active               boolean not null default true
);

-- NDA texts. Creators may use the platform standard NDA or upload their own.
create table nda_documents (
  id            uuid primary key default gen_random_uuid(),
  owner_type    owner_kind,                 -- null = platform standard NDA
  owner_id      uuid,
  title         text not null,
  body          text not null,
  version_hash  text not null generated always as (encode(digest(body, 'sha256'), 'hex')) stored,
  created_at    timestamptz not null default now()
);

create table tasks (
  id                      uuid primary key default gen_random_uuid(),
  creator_type            owner_kind not null,
  creator_id              uuid not null,
  created_by_user_id      uuid not null references users(id),
  template_id             uuid references task_templates(id),
  title                   text not null,
  category                task_category not null,
  kind                    task_kind not null default 'survey',
  instructions            text not null,
  form_schema             jsonb,
  proof_type              proof_type not null,
  review_mode             review_mode not null,

  -- Money (kobo)
  reward_kobo             bigint not null check (reward_kobo between 50000 and 50000000), -- 3 Nov: ₦500 to ₦500,000
  slots                   integer not null check (slots between 5 and 5000),             -- 3 Nov: 5 to 5,000 slots
  fee_bps                 integer check (fee_bps between 0 and 10000),    -- copied at funding: 1500 = 15%
  fee_kobo                bigint check (fee_kobo >= 0),                   -- non-refundable
  escrow_kobo             bigint generated always as (reward_kobo * slots) stored,

  -- Timing
  starts_at               timestamptz,
  ends_at                 timestamptz not null,
  estimated_minutes       integer not null default 10 check (estimated_minutes between 1 and 180),  -- 3 Nov
  attempt_minutes         integer not null default 30 check (attempt_minutes between 15 and 1440),  -- slot held this long
  needs_laptop            boolean not null default false,
  auto_approve_hours      integer not null default 72
                            check (auto_approve_hours between 1 and 72),  -- decided: creator picks, max 72h

  -- Eligibility and confidentiality
  eligibility             jsonb not null default '{}',   -- {"states":[..],"min_age":18,"min_doer_score":60,...}
  screening_quiz          jsonb,
  requires_nda            boolean not null default false,
  nda_document_id         uuid references nda_documents(id),
  data_collected_notice   text,                           -- NDPA: what personal data this task collects and why

  status                  task_status not null default 'draft',
  funded_at               timestamptz,
  closed_at               timestamptz,
  settled_at              timestamptz,
  responses_purge_after   timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  check (not requires_nda or nda_document_id is not null),
  check (attempt_minutes >= 2 * estimated_minutes),       -- 3 Nov: at least twice the estimate
  check (starts_at is null or starts_at < ends_at)
);
create index tasks_feed_idx on tasks (status, ends_at) where status = 'live';
create index tasks_creator_idx on tasks (creator_type, creator_id);

create table nda_signatures (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references tasks(id),
  user_id          uuid not null references users(id),
  nda_document_id  uuid not null references nda_documents(id),
  version_hash     text not null,          -- exact text signed
  signed_name      text not null,
  signed_at        timestamptz not null default now(),
  ip_address       inet,
  device_id        uuid references devices(id),
  unique (task_id, user_id)
);

create table submissions (
  id                   uuid primary key default gen_random_uuid(),
  task_id              uuid not null references tasks(id),
  doer_id              uuid not null references users(id),
  status               submission_status not null default 'reserved',
  reserved_at          timestamptz not null default now(),
  reserved_until       timestamptz not null,
  submitted_at         timestamptz,
  answers              jsonb,
  score                numeric(6,2),
  reviewed_by_user_id  uuid references users(id),
  reviewed_at          timestamptz,
  reject_reason        text,
  appeal_deadline      timestamptz,
  auto_approved        boolean not null default false,
  answers_purged_at    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (task_id, doer_id)                 -- one attempt per person
);
create index submissions_task_status_idx on submissions (task_id, status);
create index submissions_review_due_idx on submissions (submitted_at) where status = 'submitted';

create table submission_files (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references submissions(id) on delete cascade,
  storage_key    text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  uploaded_at    timestamptz not null default now()
);

create table appeals (
  id                uuid primary key default gen_random_uuid(),
  submission_id     uuid not null unique references submissions(id),   -- one appeal per submission
  reason            text not null,
  status            appeal_status not null default 'open',
  decided_by_user_id uuid references users(id),
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz not null default now()
);

-- Statuses that hold a slot (count against task.slots).
-- A rejected submission keeps its slot until the appeal window closes, so an appeal
-- won by the doer can always be paid from escrow. After that the slot is freed.
create or replace function submission_holds_slot(s submission_status, reserved_until timestamptz, appeal_deadline timestamptz)
returns boolean language sql stable as $$
  select case
           when s = 'reserved' then reserved_until > now()
           when s in ('submitted', 'revision_requested', 'approved', 'appealed') then true
           when s = 'rejected' then coalesce(appeal_deadline > now(), false)
           else false
         end
$$;

-- Statuses whose reward is still owed or may yet be owed (must stay in escrow at close).
create or replace function submission_reward_pending(s submission_status, reserved_until timestamptz, appeal_deadline timestamptz)
returns boolean language sql stable as $$
  select case
           when s = 'reserved' then reserved_until > now()
           when s in ('submitted', 'revision_requested', 'appealed') then true
           when s = 'rejected' then coalesce(appeal_deadline > now(), false)
           else false
         end
$$;
