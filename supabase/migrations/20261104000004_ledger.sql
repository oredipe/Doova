-- 004_ledger.sql
-- Double-entry ledger. Every money movement is one transaction whose debits equal
-- its credits. Entries are insert-only: mistakes are fixed with reversing
-- transactions, never edits or deletes.

create table ledger_accounts (
  id             uuid primary key default gen_random_uuid(),
  -- Stable lookup code, e.g. 'platform:bank_custody:paystack', 'user:<uuid>:wallet', 'task:<uuid>:escrow'
  code           text not null unique,
  type           ledger_account_type not null,
  owner_type     text,                -- 'platform' | 'user' | 'org' | 'task'
  owner_id       uuid,
  provider       payment_provider,    -- for bank_custody accounts
  currency       char(3) not null default 'NGN',
  -- Debit-normal: assets and expenses. Credit-normal: liabilities and income.
  normal_side    text not null check (normal_side in ('debit', 'credit')),
  -- Cached balance in the account's normal direction (kept by trigger, verifiable from entries).
  balance_kobo   bigint not null default 0,
  created_at     timestamptz not null default now()
);

create table ledger_transactions (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in (
                     'deposit', 'fund_task', 'release_reward', 'refund_escrow',
                     'withdrawal_request', 'payout_confirmed', 'payout_reversed',
                     'payout_fee', 'chargeback', 'adjustment')),
  -- Every caller passes a key; replaying the same webhook / approval is ignored, not paid twice.
  idempotency_key  text not null unique,
  reference_type   text,
  reference_id     uuid,
  memo             text,
  created_at       timestamptz not null default now()
);

create table ledger_entries (
  id              bigserial primary key,
  transaction_id  uuid not null references ledger_transactions(id),
  account_id      uuid not null references ledger_accounts(id),
  direction       text not null check (direction in ('debit', 'credit')),
  amount_kobo     bigint not null check (amount_kobo > 0),
  created_at      timestamptz not null default now()
);
create index ledger_entries_account_idx on ledger_entries (account_id, created_at);
create index ledger_entries_txn_idx on ledger_entries (transaction_id);

-- ---------------------------------------------------------------------------
-- Rule: insert-only
-- ---------------------------------------------------------------------------
create or replace function ledger_forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger rows are insert-only; post a reversing transaction instead';
end $$;

create trigger ledger_entries_no_update  before update or delete on ledger_entries
  for each row execute function ledger_forbid_change();
create trigger ledger_txn_no_update      before update or delete on ledger_transactions
  for each row execute function ledger_forbid_change();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function ledger_forbid_change();

-- ---------------------------------------------------------------------------
-- Rule: cached balance follows every entry
-- ---------------------------------------------------------------------------
create or replace function ledger_apply_entry() returns trigger
language plpgsql as $$
begin
  update ledger_accounts
     set balance_kobo = balance_kobo +
         case when new.direction = normal_side then new.amount_kobo else -new.amount_kobo end
   where id = new.account_id;
  return new;
end $$;

create trigger ledger_entries_apply after insert on ledger_entries
  for each row execute function ledger_apply_entry();

-- ---------------------------------------------------------------------------
-- Rule: every transaction balances (checked at COMMIT, after all its entries exist)
-- ---------------------------------------------------------------------------
create or replace function ledger_check_balanced() returns trigger
language plpgsql as $$
declare
  v_debits  bigint;
  v_credits bigint;
begin
  select coalesce(sum(amount_kobo) filter (where direction = 'debit'), 0),
         coalesce(sum(amount_kobo) filter (where direction = 'credit'), 0)
    into v_debits, v_credits
    from ledger_entries where transaction_id = new.transaction_id;
  if v_debits <> v_credits then
    raise exception 'unbalanced ledger transaction %: debits % <> credits %',
      new.transaction_id, v_debits, v_credits;
  end if;
  return null;
end $$;

create constraint trigger ledger_entries_balanced
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function ledger_check_balanced();

-- ---------------------------------------------------------------------------
-- Account helpers
-- ---------------------------------------------------------------------------
create or replace function ledger_normal_side(t ledger_account_type) returns text
language sql immutable as $$
  select case when t in ('bank_custody', 'processor_fees') then 'debit' else 'credit' end
$$;

-- Get or create an account by code.
create or replace function ledger_account(
  p_code text, p_type ledger_account_type,
  p_owner_type text default null, p_owner_id uuid default null,
  p_provider payment_provider default null
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts where code = p_code;
  if v_id is null then
    insert into ledger_accounts (code, type, owner_type, owner_id, provider, normal_side)
    values (p_code, p_type, p_owner_type, p_owner_id, p_provider, ledger_normal_side(p_type))
    on conflict (code) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from ledger_accounts where code = p_code;
    end if;
  end if;
  return v_id;
end $$;

create or replace function wallet_account(p_owner_type owner_kind, p_owner_id uuid) returns uuid
language sql as $$
  select ledger_account(p_owner_type::text || ':' || p_owner_id || ':wallet', 'user_wallet',
                        p_owner_type::text, p_owner_id)
$$;

create or replace function escrow_account(p_task uuid) returns uuid
language sql as $$
  select ledger_account('task:' || p_task || ':escrow', 'task_escrow', 'task', p_task)
$$;

create or replace function custody_account(p_provider payment_provider) returns uuid
language sql as $$
  select ledger_account('platform:bank_custody:' || p_provider, 'bank_custody',
                        'platform', null, p_provider)
$$;

create or replace function platform_account(p_type ledger_account_type) returns uuid
language sql as $$
  select ledger_account('platform:' || p_type, p_type, 'platform', null)
$$;

create or replace function account_balance(p_account uuid) returns bigint
language sql stable as $$
  select balance_kobo from ledger_accounts where id = p_account
$$;

-- ---------------------------------------------------------------------------
-- post_transaction: the ONLY way money moves.
--   p_entries: [{"account": uuid, "direction": "debit"|"credit", "amount": kobo}, ...]
-- Returns the transaction id, or the existing id if the idempotency key was seen before.
-- Balances that must never go negative are checked after posting; a chargeback is
-- the one movement allowed to push a wallet below zero (the creator then owes it).
-- ---------------------------------------------------------------------------
create or replace function post_transaction(
  p_kind text, p_idempotency_key text, p_entries jsonb,
  p_reference_type text default null, p_reference_id uuid default null,
  p_memo text default null
) returns uuid
language plpgsql as $$
declare
  v_txn      uuid;
  v_entry    jsonb;
  v_debits   bigint := 0;
  v_credits  bigint := 0;
  v_bad      record;
begin
  select id into v_txn from ledger_transactions where idempotency_key = p_idempotency_key;
  if v_txn is not null then
    return v_txn;                         -- already posted: do nothing
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    if (v_entry->>'direction') = 'debit' then
      v_debits := v_debits + (v_entry->>'amount')::bigint;
    else
      v_credits := v_credits + (v_entry->>'amount')::bigint;
    end if;
  end loop;
  if v_debits <> v_credits or v_debits = 0 then
    raise exception 'post_transaction %: debits % must equal credits % and be > 0',
      p_kind, v_debits, v_credits;
  end if;

  -- Lock the touched accounts in a fixed order to avoid deadlocks.
  perform 1 from ledger_accounts
   where id in (select (e->>'account')::uuid from jsonb_array_elements(p_entries) e)
   order by id for update;

  insert into ledger_transactions (kind, idempotency_key, reference_type, reference_id, memo)
  values (p_kind, p_idempotency_key, p_reference_type, p_reference_id, p_memo)
  returning id into v_txn;

  insert into ledger_entries (transaction_id, account_id, direction, amount_kobo)
  select v_txn, (e->>'account')::uuid, e->>'direction', (e->>'amount')::bigint
    from jsonb_array_elements(p_entries) e;

  for v_bad in
    select a.code, a.type, a.balance_kobo from ledger_accounts a
     where a.id in (select (e->>'account')::uuid from jsonb_array_elements(p_entries) e)
       and a.balance_kobo < 0
       and a.type in ('user_wallet', 'task_escrow', 'payouts_in_flight', 'bank_custody')
  loop
    -- A chargeback is forced on us by the card network: the provider takes the money
    -- even if that drives its balance (and the creator's wallet) below zero.
    if not (p_kind = 'chargeback' and v_bad.type in ('user_wallet', 'bank_custody')) then
      raise exception 'insufficient balance in % (would be % kobo)', v_bad.code, v_bad.balance_kobo
        using errcode = 'P0001';
    end if;
  end loop;

  return v_txn;
end $$;

-- ---------------------------------------------------------------------------
-- Verification views
-- ---------------------------------------------------------------------------
-- Cached balance vs recomputed from entries; any row here is a bug.
create view v_ledger_balance_drift as
select a.code, a.balance_kobo as cached_kobo,
       coalesce(sum(case when e.direction = a.normal_side then e.amount_kobo else -e.amount_kobo end), 0) as computed_kobo
  from ledger_accounts a left join ledger_entries e on e.account_id = a.id
 group by a.id
having a.balance_kobo <> coalesce(sum(case when e.direction = a.normal_side then e.amount_kobo else -e.amount_kobo end), 0);

-- Whole-ledger check: assets + expenses must equal liabilities + income.
create view v_ledger_trial_balance as
select
  sum(balance_kobo) filter (where normal_side = 'debit')  as debit_side_kobo,
  sum(balance_kobo) filter (where normal_side = 'credit') as credit_side_kobo
from ledger_accounts;
