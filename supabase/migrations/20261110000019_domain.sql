-- 019_domain.sql
-- 10 Nov 2026. Doova's address is now https://www.getdoova.com (links in notifications, the push dispatcher).
update platform_settings set value = '"https://www.getdoova.com"'
 where key = 'site_url' and value = '"https://doova-app.vercel.app"';
