# Doova

Real tasks, real pay. Doova connects Nigerians who want to earn from their phone with businesses
that need real answers. Every reward is locked in before a task goes live.

- **Web app:** Next.js 16 (App Router, TypeScript), one responsive app for phones and laptops.
- **Database and sign-in:** Supabase (Postgres, Auth with phone numbers).
- **Hosting:** Vercel. Domain and DNS on Cloudflare.

## Set up (once)

### 1. Database (Supabase)
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/setup.sql`](supabase/setup.sql) and press **Run**. It creates every
   table, rule and scheduled job. Run it once, on the empty project.
3. **Authentication → Sign In / Providers → Phone:** turn it on.
4. While there's no SMS account yet, add **test phone numbers** in the same Phone settings
   (for example `2348031234567=123456`). Signing up with that number accepts code `123456`
   and sends no text.

### 2. Website (Vercel)
1. **Add New → Project →** import `oredipe/Doova`. Framework: Next.js (detected). No build settings to change.
2. Before deploying, open **Environment Variables** and add the values from Supabase
   (**Project Settings → API Keys**):

   | Name | Where it comes from |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`). Keep it secret. |

3. Deploy. Every push to `main` deploys again.
4. In Supabase **Authentication → URL Configuration**, set **Site URL** to your `*.vercel.app` address.

### 3. Text messages (later)
When the Termii account is ready: Supabase **Authentication → Hooks → Send SMS hook → HTTPS**,
URL `https://YOUR-SITE/api/auth/sms-hook`. Put its secret in Vercel as `SUPABASE_SMS_HOOK_SECRET`,
and add `TERMII_API_KEY` and `TERMII_SENDER_ID`. Then remove the test numbers.

## Working on the code

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # http://localhost:3000
```

### Database rules every developer must follow
- All money is **integer kobo** (₦1 = 100 kobo). Never floats.
- The app never updates balances, money columns or task/submission statuses directly. It calls the
  workflow functions (`fund_task`, `reserve_slot`, `submit_submission`, `approve_submission`,
  `request_withdrawal`, …), which check the rules and move money through the double-entry ledger.
- The browser never talks to the database. Row level security is on for every table and the public
  API roles have no rights; the server uses the secret key (`src/lib/supabase/admin.ts`) and always
  scopes queries to the signed-in person.
- Change the schema by adding a new file in `supabase/migrations/`, then run `./supabase/bundle.sh`.

### Database tests
Needs a local PostgreSQL 16 and an empty test database (never the real one):

```bash
TEST_DATABASE_URL=postgres://localhost/doova_test ./supabase/tests/run_all.sh
```

It runs the money and workflow scenarios (`smoke_test.sql`), creator tiers, doer levels, XP,
streaks, badges, staff and laptop sign-in (`progression_test.sql`), and a 40-people-for-10-slots
race test.

## Decisions built in (November 2026)
- 15% platform fee on top of rewards; ₦100 per withdrawal; ₦1,500 minimum; no maximum or daily limit.
- Rewards ₦500 to ₦500,000; 5 to 5,000 slots; 1 to 180 minutes; the slot is held at least twice the estimate.
- NIN check only (no BVN, no selfie), at a doer's first withdrawal. One NIN per account.
- Paystack (Titan) first, Monnify as backup.
- Creator tiers 1–5 and doer levels 1–5 recomputed daily; XP never lost; cash bonuses paused.
- During the pilot every task waits for admin approval.
