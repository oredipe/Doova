#!/usr/bin/env bash
# Builds a throwaway database from supabase/migrations and runs every database test.
# Usage: TEST_DATABASE_URL=postgres://user:pass@localhost:5432/doova_test ./supabase/tests/run_all.sh
# Never point this at the real Supabase database: it creates test users and money.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${TEST_DATABASE_URL:?set TEST_DATABASE_URL to an empty test database}"
P="psql $TEST_DATABASE_URL -q -v ON_ERROR_STOP=1"
$P -c "drop schema if exists public cascade; drop schema if exists test_helpers cascade; create schema public;" >/dev/null
for f in migrations/*.sql; do $P -f "$f" >/dev/null; done
echo "migrations applied"
$P -f tests/smoke_test.sql | tail -1
$P -f tests/progression_test.sql 2>&1 | grep -E "PASSED|ERROR"
$P -f tests/admin_test.sql 2>&1 | grep -E "PASSED|ERROR"
$P -f tests/bank_test.sql 2>&1 | grep -E "PASSED|ERROR"
$P -f tests/staff_separation_test.sql 2>&1 | grep -E "PASSED|ERROR"
$P -f tests/notifications_test.sql 2>&1 | grep -E "PASSED|ERROR"
# fresh schema again for the race test
$P -c "drop schema public cascade; create schema public;" >/dev/null
for f in migrations/*.sql; do $P -f "$f" >/dev/null; done
DATABASE_URL=$TEST_DATABASE_URL ./tests/race_test.sh
