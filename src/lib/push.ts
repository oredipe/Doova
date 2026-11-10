import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { describe } from "@/lib/notifications";

// Phone push (Web Push). The key pair is made automatically the first time and kept in the database
// (app_secrets, service role only), so nothing needs setting up. NEXT_PUBLIC_VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY in Vercel override it if you ever want to manage the keys yourself.

let cached: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys() {
  if (cached) return cached;
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return (cached = { publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  const db = createAdminClient();
  // Each read is a different request (limit n): Next.js reuses identical reads within one render,
  // so re-reading the same query after saving would just return the first, empty answer again.
  const read = async (n: number) => {
    const { data, error } = await db.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]).limit(n);
    if (error) console.error("push keys: read failed", error.message);
    const m = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as string]));
    return m.vapid_public && m.vapid_private ? { publicKey: m.vapid_public, privateKey: m.vapid_private } : null;
  };
  let keys = await read(2);
  if (!keys) {
    const k = webpush.generateVAPIDKeys();
    // two writers racing: the first insert wins, everyone re-reads the winner
    const { error } = await db.from("app_secrets").upsert([{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }], { onConflict: "key", ignoreDuplicates: true });
    if (error) console.error("push keys: save failed", error.message);
    // the other writer's insert may not be visible yet; give it a moment
    for (let i = 0; i < 5 && !(keys = await read(3 + i)); i++) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
  }
  if (!keys) throw new Error("Couldn't set up push keys");
  return (cached = keys);
}

/** After the response is sent, push anything that's waiting (so "you've been paid" arrives in seconds). */
export function kickPush() {
  after(async () => { try { await dispatchPending(); } catch { /* the scheduler retries within a minute */ } });
}

type Pending = { id: string; user_id: string; kind: string; title: string; body: string | null; link: string; amount_kobo: number | null; count: number };

/** Send every push that's waiting (created in the last hour, not yet pushed). Safe to call any time. */
export async function dispatchPending(limit = 300): Promise<{ notes: number; sent: number; removed: number }> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data: notes } = await db.from("notifications").select("id, user_id, kind, title, body, link, amount_kobo, count")
    .is("pushed_at", null).gte("created_at", since).order("created_at").limit(limit);
  const list = (notes ?? []) as Pending[];
  if (!list.length) return { notes: 0, sent: 0, removed: 0 };
  // claim them first, so two dispatchers never send the same push
  const { data: claimed } = await db.from("notifications").update({ pushed_at: new Date().toISOString() })
    .in("id", list.map((x) => x.id)).is("pushed_at", null).select("id");
  const mine = new Set((claimed ?? []).map((r) => r.id as string));
  const todo = list.filter((x) => mine.has(x.id));
  const userIds = [...new Set(todo.map((x) => x.user_id))];
  if (!userIds.length) return { notes: 0, sent: 0, removed: 0 };
  const [{ data: subs }, { data: prefs }, { data: site }] = await Promise.all([
    db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
    db.from("users").select("id, notify_push").in("id", userIds),
    db.from("platform_settings").select("value").eq("key", "site_url").maybeSingle(),
  ]);
  const wants = new Set((prefs ?? []).filter((p) => p.notify_push).map((p) => p.id as string));
  const { publicKey, privateKey } = await vapidKeys();
  const origin = String(site?.value ?? "https://www.getdoova.com");
  let sent = 0; const dead: string[] = []; const ok: string[] = [];
  for (const x of todo) {
    if (!wants.has(x.user_id)) continue;
    const d = describe(x);
    const payload = JSON.stringify({ title: d.heading, body: d.detail, url: x.link, tag: x.kind + (x.kind === "review_waiting" || x.kind === "new_task" ? "" : ":" + x.id) });
    for (const s of (subs ?? []).filter((s) => s.user_id === x.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { vapidDetails: { subject: origin.startsWith("https://") ? origin : "mailto:hello@getdoova.com", publicKey, privateKey }, TTL: 6 * 3600, urgency: x.kind === "new_task" ? "normal" : "high" });
        sent++; ok.push(s.id as string);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id as string);   // phone unsubscribed or app removed
      }
    }
  }
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  if (ok.length) await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("id", [...new Set(ok)]);
  return { notes: todo.length, sent, removed: dead.length };
}
