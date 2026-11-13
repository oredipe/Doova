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

### Updating a database that's already set up
Each update ships as one file in `supabase/updates/`, to paste into the SQL Editor once, in date order.
`2026-11-04-step2.sql` adds the automatic checks and three **sample tasks** (from "Doova sample tasks")
for testing the doer flow. The sample money is pretend; start a fresh database before real launch.

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
4. In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://www.getdoova.com` (your `*.vercel.app` address until the domain is connected).

### Test mode (pilot only)
Add `DOOVA_TEST_MODE` = `on` in Vercel's environment variables to try the creator side before Paystack
exists: creators get an "Add test money" button when funding. The money is pretend. Tasks are approved in
the admin dashboard. Remove the variable (and start a fresh database) before real launch.

### Admin dashboard (`/admin`)
Staff (Owner, Moderator, Finance, Support) approve tasks, decide appeals, watch payouts, run the daily
money check, look up and suspend accounts, and (owners) flip switches and manage the team. Every action
is logged by name.

1. Sign up in the app with your phone like anyone else.
2. Make yourself the first owner once, in the SQL Editor:
   `select add_staff_member(null, '+2348012345678', 'owner', 'you@example.com');`
3. While signed in to the app, open `/admin`. It links your email and asks you to scan a QR code with an
   authenticator app (Google Authenticator, Microsoft Authenticator…). After that, sign in at
   `/admin/sign-in` with email, password and the 6-digit code.

Staff can be added two ways from Settings: an **admin-only account** (email sign-in with a temporary
password the owner passes on; no phone, can't use the doer/creator app, must choose their own password
first), or admin on their existing **Doova account** (by phone). Staff never decide on tasks they or their
business posted, or on appeals about their own work.

Supabase needs **Authentication → Sign In / Providers → Email** enabled (for the email sign-in) and
**Multi-Factor → TOTP** enabled (on by default). Add more staff from Settings in the dashboard; they sign
up in the app first.

### Doova tasks (`/admin/doova`)
Doova's own tasks: promotions, feature tests, platform checks. Owners post them from **Create → Doova
tasks** with the usual task builder, but with no minimum reward or slots and no fee; they go live straight
away and doers see them marked **From Doova**. A ₦0 task pays nothing and earns a small amount of XP
instead (`xp_unpaid_task` in `platform_settings`, 10 to start); it's labelled "Unpaid · earns XP".
Rewards come from the **Doova budget**. Owners top it up by transferring from any bank app to the budget's
own Paystack account number (created once on the page; credited automatically like a creator's), from fees
Doova has already earned, by recording a transfer by hand with its reference (each counts once), or with
pretend money in test mode. Unused rewards return to the budget when a task closes. Owners and
moderators review responses and download answers; Doova staff can't take part in Doova tasks. The money
check shows the budget separately from money owed to users.

### Payments (Paystack)
Without a Paystack key, a built-in stand-in is used in test mode: bank checks echo your name and
withdrawals are marked sent straight away. To connect Paystack:

1. In Paystack, **Settings → API Keys & Webhooks**: copy the **Test Secret Key** into Vercel as
   `PAYSTACK_SECRET_KEY`, and set the **Test Webhook URL** to `https://YOUR-SITE/api/paystack/webhook`.
2. Paystack **Transfer approvals**: untick "Confirm transfers before sending" (no OTP), so withdrawals
   go out automatically.
3. Ask Paystack to enable **Dedicated Virtual Accounts** (creator account numbers). In test mode they
   come from "Test Bank"; send test money with Paystack's demo bank app.
4. Going live: swap in the live secret key and live webhook URL. Optional `PAYSTACK_PREFERRED_BANK`
   (`titan-paystack` by default, or `wema-bank`).

**NIN checks** use Monnify (Paystack doesn't check NINs); until `NIN_PROVIDER` is set, test mode accepts
any 11 digits and uses the person's profile name. To switch Monnify on:
1. Open a Monnify account for Doova Labs Limited and get it approved (NIN lookups are live-only; the sandbox has none).
2. Top up the Monnify wallet: each successful lookup costs ₦60 (₦6,000 covers 100 doers).
3. Run `supabase/updates/2026-11-13-nin-checks.sql` in the Supabase SQL editor.
4. In Vercel add `NIN_PROVIDER=monnify`, `MONNIFY_API_KEY` and `MONNIFY_SECRET_KEY` (Monnify → Developers →
   API Keys & Webhooks, **live** keys), and `NIN_HASH_SECRET` as a long random string you never change (it keeps
   one NIN per account). Redeploy.
5. Try it with your own NIN first.

The NIN's name must match the Doova name and its date of birth must match the one given at sign-up (accounts
without one get it from the NIN). Nothing from the NIN record is shown back to the person. Each person gets 3
tries a day; every attempt is logged in `nin_checks` (never the NIN), and an NIN showing someone under 18 flags
the account. If the Monnify wallet runs dry, people see "try again in a few hours" and it doesn't use up their tries.

### Notifications
The database writes notifications when things happen (paid, not approved, appeal kept, responses to
review, task live or turned down, money added, withdrawal sent or failed, new tasks for doers); repeats
collapse into one item. People see them in the bell, and can turn on phone notifications (Web Push) in
Notifications or Settings. The push key pair is created automatically and kept in `app_secrets`; set
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Vercel only if you want to manage it yourself.
Pushes go out straight after app actions, and the database scheduler (pg_cron + pg_net) pokes
`/api/push/dispatch` every minute for anything else. When the domain changes, update `site_url` in
`platform_settings`. On iPhone, push works once Doova is added to the home screen.

### 3. Text messages (Termii)
Codes are sent by `/api/auth/sms-hook`: Supabase hands it each code, it sends the text through Termii
(DND route, so it reaches numbers on Do-Not-Disturb). Switch on once Termii has approved a Sender ID
(or confirmed a generic one you may use):
1. Vercel → Environment Variables (Production): `TERMII_API_KEY` (Termii dashboard), `TERMII_SENDER_ID`
   (e.g. `Doova`), optionally `TERMII_BASE_URL` (default `https://v4.api.termii.com`) and
   `TERMII_CHANNEL` (default `dnd`). Redeploy.
2. Supabase → **Authentication → Auth Hooks → Send SMS hook → HTTPS**, URL
   `https://www.getdoova.com/api/auth/sms-hook`. Generate the secret, copy it into Vercel as
   `SUPABASE_SMS_HOOK_SECRET`, redeploy, then enable the hook.
3. Supabase → Authentication → Sign In / Providers → Phone: set the SMS OTP expiry to 600 seconds
   (the text says the code lasts 10 minutes).
4. Test with your own real number, then remove the test phone numbers.
Failures show in Vercel's logs as `sms: …` (numbers are shortened), and people see "We couldn't send a
text right now"; a common cause is an empty Termii wallet.

**Sender ID (13 Nov 2026):** Termii refused the custom "Doova" Sender ID (it wants an operational
licence, for a software company a NITDA registration). Until then use Termii's managed ID: Termii
dashboard → IDs → request the managed ID, and put the name they give you in `TERMII_SENDER_ID`.
Airtel no longer delivers codes from shared IDs, so turn on the backups below and test an Airtel line.

**Backups: WhatsApp and voice call.** Phone-code screens show "No text after a minute? Get the code on:
WhatsApp / Call me" once each is switched on. Tapping one records the choice (`/api/auth/code-channel`,
max 5 an hour per number), asks Supabase for a new code, and the hook sends it that way, falling back to a
text if the route fails.
1. Run `supabase/updates/2026-11-13-code-channels.sql`.
2. WhatsApp: ask Termii support to enable WhatsApp OTP ("Send WhatsApp Token") on the account; they give
   you a device name. Set `TERMII_WHATSAPP_FROM` to it.
3. Voice: ask Termii to enable voice OTP calls, then set `TERMII_VOICE=on` (optional `TERMII_VOICE_PATH`,
   default `/api/sms/otp/call`; Termii's docs also mention `/api/sms/otp/send/voice`).
4. Redeploy and try each one on your own phone.

### 4. Email codes (Resend)
Doers always sign up with a phone number (one SIM, one doer: it keeps fake accounts off task slots).
Creators can sign up by email (or by phone once text codes are on). Anyone can add an email in
Settings → Sign-in details and then sign in or reset their password with a 6-digit code by email;
the Tasks page nudges phone accounts to add one.

An account with no checked phone number can post tasks but can't do any (the database refuses), and
adds a phone number before withdrawing once text codes are on. The NIN check and "one bank account,
one Doova account" apply to everyone. Text codes count as on when `TERMII_API_KEY` and
`TERMII_SENDER_ID` are both set in Vercel; `SMS_CODES=on` or `off` forces it (it changes wording and
the withdrawal phone step; Supabase test phone numbers work either way).

1. resend.com → add the domain `getdoova.com`, add the DNS records it shows in Cloudflare (DNS only),
   wait for "Verified", then create an API key.
2. Supabase → **Authentication → Emails → SMTP Settings**: enable custom SMTP. Sender email
   `no-reply@getdoova.com`, sender name `Doova`, host `smtp.resend.com`, port `465`, username
   `resend`, password = the Resend API key.
3. Supabase → **Authentication → Emails → Templates**: paste the files in `supabase/email-templates/`
   into **Confirm signup** (subject "Your Doova sign-up code"), **Magic Link** ("Your Doova sign-in
   code"), **Change Email Address** ("Confirm your email for Doova") and **Reset Password** ("Reset
   your Doova password"; forgot password by email uses it). They show the code (`{{ .Token }}`), not a link.
4. Supabase → **Authentication → Sign In / Providers → Email**: enabled, "Confirm email" on, Email OTP
   length **6**, Email OTP expiration **600** seconds.
5. Supabase → **Authentication → Rate Limits**: raise "emails sent" from the default to about 100 an hour.
6. Run `supabase/updates/2026-11-10-email-codes.sql` in the SQL editor.

## Working on the code

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # http://localhost:3000
```

### Website pages
`/`, `/doers`, `/creators` and `/about` are the getdoova.com pages from the design canvas. Their HTML lives in
`src/site/*.ts` (generated from the canvas, so edit the design and re-export rather than editing by hand),
styled by `src/app/(site)/website.css`. Photos and screen mockups are in `public/site/` as WebP. The cost
calculator on For creators is a React component (`src/app/(site)/creators/CostCalculator.tsx`).

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
streaks, badges, staff and laptop sign-in (`progression_test.sql`), the admin dashboard's staff
functions (`admin_test.sql`), NIN, bank accounts and withdrawals (`bank_test.sql`), staff conflicts and
admin-only accounts (`staff_separation_test.sql`), notifications (`notifications_test.sql`), and a 40-people-for-10-slots race test.

## Decisions built in (November 2026)
- 15% platform fee on top of rewards; ₦100 per withdrawal; ₦1,500 minimum; no maximum or daily limit.
- Rewards ₦500 to ₦500,000; 5 to 5,000 slots; 1 to 180 minutes; the slot is held at least twice the estimate.
- NIN check only (no BVN, no selfie), at a doer's first withdrawal. One NIN per account.
- Paystack (Titan) first, Monnify as backup.
- Creator tiers 1–5 and doer levels 1–5 recomputed daily; XP never lost; cash bonuses paused.
- During the pilot every task waits for admin approval.
