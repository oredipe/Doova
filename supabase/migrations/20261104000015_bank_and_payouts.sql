-- 015_bank_and_payouts.sql
-- Step 5 (4 Nov 2026): NIN check, bank accounts that must match the NIN name, creator account
-- numbers, and the payout states the Paystack transfer goes through.

-- ---------------------------------------------------------------------------
-- NIN check (done once, before the first withdrawal). The NIN itself is never stored: only a
-- keyed hash (one NIN per account) and the legal name it returned (to match bank accounts).
-- ---------------------------------------------------------------------------
alter table users add column if not exists legal_name text;

create or replace function record_nin_check(p_user uuid, p_nin_hash text, p_legal_name text) returns void
language plpgsql as $$
begin
  if coalesce(btrim(p_nin_hash), '') = '' or coalesce(btrim(p_legal_name), '') = '' then
    raise exception 'the NIN check returned no name';
  end if;
  if exists (select 1 from users where nin_hash = p_nin_hash and id <> p_user) then
    raise exception 'this NIN is already linked to another Doova account';
  end if;
  update users set nin_hash = p_nin_hash, legal_name = btrim(p_legal_name), kyc_tier = greatest(kyc_tier, 1),
                   kyc_verified_at = coalesce(kyc_verified_at, now()), updated_at = now()
   where id = p_user;
  if not found then raise exception 'account not found'; end if;
end $$;

-- Two names match when every word of the shorter one appears in the longer one, ignoring case,
-- punctuation and order ("ADEBAYO KEMI A" matches "Kemi Adebayo"; initials match a word's first letter).
create or replace function names_match(p_a text, p_b text) returns boolean
language plpgsql immutable as $$
declare
  a text[] := regexp_split_to_array(btrim(regexp_replace(lower(coalesce(p_a, '')), '[^a-z ]+', ' ', 'g')), '\s+');
  b text[] := regexp_split_to_array(btrim(regexp_replace(lower(coalesce(p_b, '')), '[^a-z ]+', ' ', 'g')), '\s+');
  short text[]; long text[]; w text; full_words int := 0;
begin
  a := array_remove(a, ''); b := array_remove(b, '');
  if coalesce(array_length(a, 1), 0) = 0 or coalesce(array_length(b, 1), 0) = 0 then return false; end if;
  if array_length(a, 1) <= array_length(b, 1) then short := a; long := b; else short := b; long := a; end if;
  foreach w in array short loop
    if length(w) = 1 then
      if not exists (select 1 from unnest(long) x where left(x, 1) = w) then return false; end if;
    else
      if not (w = any(long)) then return false; end if;
      full_words := full_words + 1;
    end if;
  end loop;
  return full_words >= least(2, array_length(long, 1));   -- at least two full names in common
end $$;

-- ---------------------------------------------------------------------------
-- Bank accounts. People must have passed the NIN check, and the bank's account name must match it.
-- ---------------------------------------------------------------------------
alter table bank_accounts add column if not exists bank_name text;
alter table bank_accounts add column if not exists recipient_code text;   -- Paystack transfer recipient

create or replace function save_bank_account(p_owner_type owner_kind, p_owner_id uuid, p_by uuid,
  p_bank_code text, p_bank_name text, p_account_number text, p_account_name text, p_recipient_code text default null)
returns uuid language plpgsql as $$
declare v_name text; v_id uuid;
begin
  if p_owner_type = 'user' then
    if p_by <> p_owner_id then raise exception 'you can only add your own bank account'; end if;
    select legal_name into v_name from users where id = p_owner_id and kyc_tier >= 1;
    if v_name is null then raise exception 'check your NIN before adding a bank account'; end if;
  else
    if not exists (select 1 from org_members where org_id = p_owner_id and user_id = p_by and role = 'owner') then
      raise exception 'only the business owner can add a bank account';
    end if;
    select name into v_name from organizations where id = p_owner_id;
  end if;
  if not names_match(p_account_name, v_name) then
    raise exception 'the account name % does not match %', p_account_name, v_name;
  end if;
  update bank_accounts set is_default = false where owner_type = p_owner_type and owner_id = p_owner_id;
  insert into bank_accounts (owner_type, owner_id, bank_code, bank_name, account_number, account_name,
                             name_matched, verified_at, is_default, recipient_code)
  values (p_owner_type, p_owner_id, p_bank_code, p_bank_name, p_account_number, p_account_name, true, now(), true, p_recipient_code)
  on conflict (owner_type, owner_id, bank_code, account_number) do update
     set account_name = excluded.account_name, bank_name = excluded.bank_name, name_matched = true,
         verified_at = now(), is_default = true, recipient_code = coalesce(excluded.recipient_code, bank_accounts.recipient_code)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Creator account numbers (Paystack dedicated accounts).
-- ---------------------------------------------------------------------------
create or replace function save_virtual_account(p_owner_type owner_kind, p_owner_id uuid, p_provider payment_provider,
  p_bank text, p_account_number text, p_account_name text, p_provider_ref text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into virtual_accounts (owner_type, owner_id, provider, issuing_bank, account_number, account_name, provider_ref)
  values (p_owner_type, p_owner_id, p_provider, p_bank, p_account_number, p_account_name, p_provider_ref)
  on conflict (owner_type, owner_id, provider) do update
     set issuing_bank = excluded.issuing_bank, account_number = excluded.account_number,
         account_name = excluded.account_name, provider_ref = excluded.provider_ref, is_active = true
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Payout states: pending (money moved to "in flight") → processing (transfer sent to Paystack)
-- → succeeded / failed (webhook). The transfer reference is the payout id.
-- ---------------------------------------------------------------------------
create or replace function mark_payout_sent(p_payout uuid, p_transfer_code text) returns void
language plpgsql as $$
begin
  update payouts set status = 'processing', provider_ref = coalesce(p_transfer_code, provider_ref)
   where id = p_payout and status = 'pending';
end $$;

revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;
