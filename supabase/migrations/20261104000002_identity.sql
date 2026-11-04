-- 002_identity.sql
-- People, organisations, devices, bank accounts and data-protection requests.

create table users (
  id               uuid primary key default gen_random_uuid(),
  phone            text unique not null,
  email            citext unique,
  full_name        text,
  -- Verification: 0 = phone checked, 1 = NIN checked (3 Nov: NIN only, no selfie, no BVN; done at first withdrawal)
  kyc_tier         smallint not null default 0 check (kyc_tier between 0 and 1),
  -- NIN is stored only as a salted hash after verification (NDPA: minimise). One NIN per account.
  nin_hash         text unique,
  kyc_verified_at  timestamptz,
  tin              text,                         -- optional tax ID
  doer_score       numeric(5,2) not null default 0,
  creator_score    numeric(5,2) not null default 0,
  status           user_status not null default 'active',
  is_flagged       boolean not null default false,
  privacy_consent_at   timestamptz,             -- active tick-box consent at sign-up
  privacy_policy_version text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  cac_number       text unique,                  -- RC or BN number, checked with CAC
  kyc_tier         smallint not null default 0 check (kyc_tier between 0 and 1),   -- 1 = CAC checked
  owner_user_id    uuid not null references users(id),
  created_at       timestamptz not null default now()
);

create table org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id),
  role       org_role not null,
  added_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Fraud signal: many accounts on one device.
create table devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  fingerprint  text not null,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index devices_fingerprint_idx on devices (fingerprint);

-- Withdrawal destinations. Name must match the verified name before use.
create table bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  owner_type      owner_kind not null,
  owner_id        uuid not null,
  bank_code       text not null,
  account_number  text not null check (account_number ~ '^[0-9]{10}$'),
  account_name    text not null,
  name_matched    boolean not null default false,
  verified_at     timestamptz,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (owner_type, owner_id, bank_code, account_number)
);
-- Fraud signal: many owners withdrawing to the same bank account.
create index bank_accounts_number_idx on bank_accounts (bank_code, account_number);

-- NDPA: users can request export, correction or deletion of their data.
create table data_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  request_type  data_request_type not null,
  status        data_request_status not null default 'received',
  details       text,
  received_at   timestamptz not null default now(),
  completed_at  timestamptz
);

-- Kyc tier of a wallet owner (user or org).
create or replace function owner_kyc_tier(p_type owner_kind, p_id uuid) returns smallint
language sql stable as $$
  select case p_type
           when 'user' then (select kyc_tier from users where id = p_id)
           when 'org'  then (select kyc_tier from organizations where id = p_id)
         end
$$;

-- Is this user the creator, or a member of the creating organisation? (blocks self-dealing)
create or replace function is_creator_side(p_creator_type owner_kind, p_creator_id uuid, p_user uuid)
returns boolean language sql stable as $$
  select case p_creator_type
           when 'user' then p_creator_id = p_user
           when 'org'  then exists (select 1 from org_members where org_id = p_creator_id and user_id = p_user)
         end
$$;
