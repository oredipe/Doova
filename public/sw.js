// Doova service worker: shows phone notifications and opens the right page when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Doova", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "Doova", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: d.tag,
    renotify: Boolean(d.tag),
    data: { url: d.url || "/tasks" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url || "/tasks", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
