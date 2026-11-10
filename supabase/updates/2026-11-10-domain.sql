-- Doova update, 10 Nov 2026: the new address, getdoova.com.
-- Run this only once https://www.getdoova.com opens the app. Paste into a New query in the Supabase SQL editor and press Run.

-- 019_domain.sql
-- 10 Nov 2026. Doova's address is now https://www.getdoova.com (links in notifications, the push dispatcher).
update platform_settings set value = '"https://www.getdoova.com"'
 where key = 'site_url' and value = '"https://doova-app.vercel.app"';
