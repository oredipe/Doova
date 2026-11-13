-- Doova update, 13 Nov 2026: codes by WhatsApp or voice call (backup when texts don't arrive).
-- Paste into a New query in the Supabase SQL editor and press Run. Safe to run more than once.

-- 023_code_channels.sql
-- 13 Nov 2026. Codes by WhatsApp or a voice call when the text doesn't arrive (Airtel no longer delivers
-- codes sent from shared Sender IDs). The person taps "Send it on WhatsApp" or "Call me with the code";
-- the app records that choice here for 5 minutes, asks Supabase for a new code, and the SMS hook sends
-- that code by the chosen route. At most 5 such requests per number per hour.

create table if not exists code_channel_requests (
  id bigserial primary key,
  phone text not null,                         -- digits only, 234…
  channel text not null check (channel in ('whatsapp', 'voice')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists code_channel_requests_phone_idx on code_channel_requests (phone, created_at desc);
alter table code_channel_requests enable row level security;   -- server only; no policies
