-- 001_extensions_and_types.sql
-- Extensions, enum types and platform settings.
-- All money is stored as integer kobo (₦1 = 100 kobo). Never use floats for money.

create extension if not exists pgcrypto;   -- gen_random_uuid(), digest()
create extension if not exists citext;     -- case-insensitive email

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type owner_kind          as enum ('user', 'org');
create type user_status         as enum ('active', 'suspended', 'deleted');
create type org_role            as enum ('owner', 'poster', 'reviewer', 'viewer');   -- 3 Nov: only owners move money
create type payment_provider    as enum ('paystack', 'monnify');                    -- 3 Nov: Titan-Paystack primary, Monnify backup
create type payment_channel     as enum ('bank_transfer', 'card');
create type payment_status      as enum ('pending', 'succeeded', 'failed');
create type payout_status       as enum ('pending', 'processing', 'succeeded', 'failed');
create type task_category       as enum ('native', 'proof_based', 'skill_gated', 'field');
create type task_kind           as enum ('survey', 'review', 'labelling', 'app_test', 'other');
create type staff_role          as enum ('owner', 'moderator', 'finance', 'support');
create type review_mode         as enum ('auto', 'manual');
create type proof_type          as enum ('form', 'file', 'link', 'text', 'screenshot', 'mixed');
create type task_status         as enum (
  'draft', 'pending_funding', 'under_moderation', 'live',
  'paused', 'filled', 'closed', 'settled', 'rejected_by_moderation'
);
create type submission_status   as enum (
  'reserved', 'expired', 'submitted', 'revision_requested',
  'approved', 'rejected', 'appealed', 'rejected_final', 'withdrawn'
);
create type appeal_status       as enum ('open', 'upheld_for_doer', 'upheld_for_creator');
create type ledger_account_type as enum (
  'bank_custody',        -- asset: real money at Paystack (Titan) or Monnify
  'user_wallet',         -- liability: money owed to a user or org
  'task_escrow',         -- liability: money locked for one task's rewards
  'payouts_in_flight',   -- liability: withdrawals sent, not yet confirmed
  'platform_revenue',    -- income: platform fees
  'processor_fees'       -- expense: fees paid to Paystack / Monnify
);
create type data_request_type   as enum ('export', 'delete', 'correct');
create type data_request_status as enum ('received', 'in_progress', 'completed', 'rejected');

-- ---------------------------------------------------------------------------
-- Platform settings (one row per key). Values the business may tune later.
-- Hard business rules that must never be bypassed are ALSO enforced as
-- CHECK constraints on the tables (minimum reward, maximum auto-approve).
-- ---------------------------------------------------------------------------
create table platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

insert into platform_settings (key, value, description) values
  ('platform_fee_bps',              '1500',     'Platform fee in basis points (1500 = 15%). Copied onto each task when funded.'),
  ('min_reward_kobo',               '50000',    'Minimum reward per completion: ₦500 (also a CHECK on tasks).'),
  ('max_reward_kobo',               '50000000', 'Maximum reward per completion: ₦500,000 (also a CHECK on tasks).'),
  ('pilot_all_tasks_need_approval', 'true',     'Pilot (4 Nov): every task waits for admin approval.'),
  ('doer_cash_bonuses_enabled',     'false',    'Level, streak and invite cash bonuses: designed, paused until investment (4 Nov).'),
  ('max_auto_approve_hours',        '72',       'Maximum auto-approve window a creator may choose (also a CHECK on tasks).'),
  ('default_auto_approve_hours',    '72',       'Default auto-approve window when the creator does not choose.'),
  ('default_attempt_minutes',       '30',       'Default time a doer holds a reserved slot.'),
  ('appeal_window_hours',           '48',       'How long a doer has to appeal a rejection.'),
  ('min_withdrawal_kobo',           '150000',   'Minimum withdrawal: ₦1,500. Waived when someone closes their account.'),
  ('withdrawal_fee_kobo',           '10000',    'Flat Doova fee per withdrawal: ₦100, deducted from the amount. Platform revenue. Waived on account closure.'),
  ('stamp_duty_threshold_kobo',     '1000000',  'Payouts of ₦10,000 or more attract stamp duty.'),
  ('stamp_duty_kobo',               '5000',     'Stamp duty per qualifying payout: ₦50, passed on to the person withdrawing.'),
  ('chargeback_fee_kobo',           '250000',   'Processor chargeback fee: ₦2,500, debited from the creator wallet.'),
  ('response_retention_days',       '365',      'Survey answers are purged this many days after the task closes unless exported.'),
  ('withdrawals_paused',            'false',    'Set true automatically when daily reconciliation finds a gap.');

create or replace function setting_int(p_key text) returns bigint
language sql stable as $$
  select (value #>> '{}')::bigint from platform_settings where key = p_key
$$;

create or replace function setting_bool(p_key text) returns boolean
language sql stable as $$
  select (value #>> '{}')::boolean from platform_settings where key = p_key
$$;
