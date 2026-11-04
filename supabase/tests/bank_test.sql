-- bank_test.sql
-- NIN check, name matching, bank accounts and the withdrawal life cycle from Earnings and Creator funds.
\set QUIET on
create schema if not exists test_helpers;
set search_path = public, test_helpers;
create or replace function test_helpers._expect_error(p_sql text, p_words text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected an error containing "%" but it succeeded', p_words;
exception when others then
  if position(lower(p_words) in lower(sqlerrm)) = 0 then
    raise exception 'expected "%" but got "%"', p_words, sqlerrm;
  end if;
end $$;

\echo '1. Names match regardless of order, case and initials'
do $$ begin
  assert names_match('ADEBAYO KEMI A', 'Kemi Adunni Adebayo');
  assert names_match('Kemi Adebayo', 'ADEBAYO, KEMI');
  assert names_match('OREDIPE OLANREWAJU', 'Olanrewaju Oredipe Samuel');
  assert not names_match('Kemi Okafor', 'Kemi Adebayo');
  assert not names_match('Kemi', 'Kemi Adebayo');               -- one shared word is not enough
  assert not names_match('', 'Kemi Adebayo');
  assert names_match('Mama Put Foods Ltd', 'MAMA PUT FOODS LTD');
end $$;

\echo '2. NIN once per account; bank account must match the NIN name'
do $$
declare d uuid; e uuid;
begin
  insert into users (phone, full_name) values ('+2349200000001', 'Kemi A') returning id into d;
  insert into users (phone, full_name) values ('+2349200000002', 'Other') returning id into e;
  perform _expect_error(format($q$select save_bank_account('user', %L, %L, '058', 'GTBank', '0123456789', 'KEMI ADEBAYO')$q$, d, d), 'check your NIN');
  perform record_nin_check(d, 'hash-1', 'Kemi Adunni Adebayo');
  assert (select kyc_tier from users where id = d) = 1;
  perform _expect_error(format($q$select record_nin_check(%L, 'hash-1', 'Someone')$q$, e), 'already linked');
  perform _expect_error(format($q$select save_bank_account('user', %L, %L, '058', 'GTBank', '0123456789', 'KEMI OKAFOR')$q$, d, d), 'does not match');
  perform _expect_error(format($q$select save_bank_account('user', %L, %L, '058', 'GTBank', '0123456789', 'KEMI ADEBAYO')$q$, d, e), 'your own bank account');
  perform save_bank_account('user', d, d, '058', 'GTBank', '0123456789', 'ADEBAYO KEMI A', 'RCP_1');
  perform save_bank_account('user', d, d, '044', 'Access Bank', '9876543210', 'KEMI ADEBAYO', 'RCP_2');
  assert (select count(*) from bank_accounts where owner_id = d and is_default) = 1;
  assert (select bank_code from bank_accounts where owner_id = d and is_default) = '044';
end $$;

\echo '3. Withdraw from Earnings: sent, confirmed; a failed one comes back with the fee'
do $$
declare d uuid := (select id from users where phone = '+2349200000001');
        b uuid := (select id from bank_accounts where owner_id = (select id from users where phone = '+2349200000001') and is_default);
        p1 uuid; p2 uuid;
begin
  -- give Kemi ₦5,000 of earnings and ₦3,000 of creator funds
  perform record_deposit('paystack', 'BANK-T-1', 'user', d, 'bank_transfer', 800000, 0);
  perform post_transaction('adjustment', 'bank-test-earn', jsonb_build_array(
    jsonb_build_object('account', wallet_account('user', d), 'direction', 'debit', 'amount', 500000),
    jsonb_build_object('account', earnings_account(d), 'direction', 'credit', 'amount', 500000)), 'user', d, 'test');
  perform _expect_error(format($q$select request_withdrawal('user', %L, %L, %L, 100000)$q$, d, d, b), 'minimum withdrawal');
  p1 := request_withdrawal('user', d, d, b, 200000);
  assert account_balance(earnings_account(d)) = 300000;
  perform mark_payout_sent(p1, 'TRF_1');
  assert (select status from payouts where id = p1) = 'processing';
  perform confirm_payout(p1, 'TRF_1', 1000);
  perform confirm_payout(p1, 'TRF_1', 1000);                      -- webhook replay is harmless
  assert (select status from payouts where id = p1) = 'succeeded';
  p2 := request_withdrawal('user', d, d, b, 300000, 'paystack', false, 'funds');
  assert account_balance(wallet_account('user', d)) = 0 and (select purse from payouts where id = p2) = 'funds';
  perform mark_payout_sent(p2, 'TRF_2');
  perform fail_payout(p2, 'Account not found');
  assert account_balance(wallet_account('user', d)) = 300000;        -- all back, fee included
  assert account_balance(earnings_account(d)) = 300000;
  assert not exists (select 1 from v_ledger_balance_drift);
end $$;

\echo '4. Creator account numbers: one per person per provider, updated in place'
do $$
declare c uuid := (select id from users where phone = '+2349200000002'); v1 uuid; v2 uuid;
begin
  v1 := save_virtual_account('user', c, 'paystack', 'Wema Bank', '9930000001', 'DOOVA/OTHER', 'CUS_1');
  v2 := save_virtual_account('user', c, 'paystack', 'Titan Paystack', '9930000002', 'DOOVA/OTHER', 'CUS_1');
  assert v1 = v2 and (select account_number from virtual_accounts where id = v1) = '9930000002';
end $$;

\echo 'ALL BANK TESTS PASSED'
