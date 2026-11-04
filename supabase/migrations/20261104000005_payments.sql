-- 005_payments.sql
-- External money: virtual accounts, incoming payments, payouts, chargebacks,
-- webhook log and daily reconciliation.
-- Primary provider: Paystack (Titan-Paystack dedicated accounts). Backup: Monnify (Moniepoint).
-- Each creator gets a dedicated account number; doers get none (3 Nov).

create table virtual_accounts (
  id               uuid primary key default gen_random_uuid(),
  owner_type       owner_kind not null,
  owner_id         uuid not null,
  provider         payment_provider not null,
  issuing_bank     text not null,          -- 'Titan-Paystack' | 'Moniepoint'
  account_number   text not null check (account_number ~ '^[0-9]{10}$'),
  account_name     text not null,
  provider_ref     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (provider, account_number),
  unique (owner_type, owner_id, provider)
);

-- Raw webhooks, stored before processing. (provider, event_id) makes replays harmless.
create table webhook_events (
  id            bigserial primary key,
  provider      payment_provider not null,
  event_id      text not null,
  event_type    text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  unique (provider, event_id)
);

-- Money in: bank transfer to a virtual account, or card checkout.
create table payments (
  id                     uuid primary key default gen_random_uuid(),
  owner_type             owner_kind not null,
  owner_id               uuid not null,
  provider               payment_provider not null,
  channel                payment_channel not null,
  provider_ref           text not null,
  virtual_account_id     uuid references virtual_accounts(id),
  amount_kobo            bigint not null check (amount_kobo > 0),   -- gross amount paid
  fee_kobo               bigint not null default 0 check (fee_kobo >= 0),  -- processor collection fee
  net_kobo               bigint generated always as (amount_kobo - fee_kobo) stored,
  status                 payment_status not null default 'pending',
  card_3ds_verified      boolean,                                    -- required for card payments
  ledger_transaction_id  uuid references ledger_transactions(id),
  received_at            timestamptz not null default now(),
  unique (provider, provider_ref),
  check (fee_kobo < amount_kobo)
);

-- Money out: withdrawal to a name-matched bank account.
create table payouts (
  id                       uuid primary key default gen_random_uuid(),
  owner_type               owner_kind not null,
  owner_id                 uuid not null,
  bank_account_id          uuid not null references bank_accounts(id),
  provider                 payment_provider not null,
  amount_kobo              bigint not null check (amount_kobo > 0),   -- debited from wallet
  withdrawal_fee_kobo      bigint not null default 0 check (withdrawal_fee_kobo >= 0),  -- Doova's flat fee (revenue)
  stamp_duty_kobo          bigint not null default 0,                 -- passed on to the person withdrawing
  transfer_kobo            bigint generated always as (amount_kobo - withdrawal_fee_kobo - stamp_duty_kobo) stored,  -- reaches their bank
  is_account_closure       boolean not null default false,            -- minimum and fee waived
  processor_fee_kobo       bigint,                                     -- absorbed by the platform
  status                   payout_status not null default 'pending',
  provider_ref             text,
  failure_reason           text,
  requested_at             timestamptz not null default now(),
  completed_at             timestamptz,
  request_txn_id           uuid references ledger_transactions(id),
  settle_txn_id            uuid references ledger_transactions(id),
  unique (provider, provider_ref),
  check (amount_kobo - withdrawal_fee_kobo - stamp_duty_kobo > 0)
);
create index payouts_owner_day_idx on payouts (owner_type, owner_id, requested_at);

-- Card disputes. The amount plus the processor's fee is debited from the creator's wallet.
create table chargebacks (
  id                     uuid primary key default gen_random_uuid(),
  payment_id             uuid not null unique references payments(id),
  amount_kobo            bigint not null check (amount_kobo > 0),
  fee_kobo               bigint not null default 0,
  provider_ref           text,
  reason                 text,
  ledger_transaction_id  uuid references ledger_transactions(id),
  received_at            timestamptz not null default now()
);

-- Daily: ledger custody balance vs the bank/provider statement.
create table reconciliations (
  id                   bigserial primary key,
  provider             payment_provider not null,
  statement_date       date not null,
  statement_kobo       bigint not null,
  ledger_kobo          bigint not null,
  difference_kobo      bigint generated always as (statement_kobo - ledger_kobo) stored,
  withdrawals_paused   boolean not null,
  created_at           timestamptz not null default now(),
  unique (provider, statement_date)
);
