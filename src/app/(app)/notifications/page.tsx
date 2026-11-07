import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PushToggle } from "@/components/PushToggle";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { describe, type Note } from "@/lib/notifications";
import { vapidKeys } from "@/lib/push";
import { nowMs } from "@/lib/time";

export const metadata: Metadata = { title: "Notifications" };

function when(iso: string, now: number) {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(iso));
}

export default async function NotificationsPage() {
  const me = await requireProfile();
  const db = createAdminClient();
  const [{ data }, keys] = await Promise.all([
    db.from("notifications").select("id, kind, title, body, link, amount_kobo, count, created_at, read_at")
      .eq("user_id", me.id).order("created_at", { ascending: false }).limit(60),
    vapidKeys().catch(() => null),
  ]);
  const notes = (data ?? []) as Note[];
  if (notes.some((x) => !x.read_at)) await db.rpc("mark_notifications_read", { p_user: me.id });
  const now = nowMs();
  const ICON = { money: "wallet", bad: "info", info: "spark" } as const;
  const BG = { money: "var(--c-paid)", bad: "var(--c-bad-soft)", info: "var(--c-violet-soft)" };

  return (
    <>
      <h1 className="c-title">Notifications</h1>
      {keys && <section className="c-card"><PushToggle publicKey={keys.publicKey} /></section>}
      {notes.length === 0 ? (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="bell" size={30} /></span>
          <h2 className="c-h2">Nothing yet</h2>
          <p className="c-sub" style={{ maxWidth: 360 }}>When you&rsquo;re paid, when work needs your review, or when new tasks arrive, it shows here.</p>
        </div>
      ) : (
        <div className="c-group">
          {notes.map((x) => {
            const d = describe(x);
            return (
              <Link key={x.id} href={x.link} className="c-row" style={!x.read_at ? { background: "#FBFDF3" } : undefined}>
                <span className="c-ico" style={{ background: BG[d.tone] }}><Icon name={ICON[d.tone]} size={18} /></span>
                <span className="c-row-main">
                  <span className="c-row-title" style={{ fontSize: 16 }}>{d.heading}</span>
                  <span className="c-small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.detail}</span>
                </span>
                <span className="c-small" style={{ whiteSpace: "nowrap", alignSelf: "flex-start" }}>
                  {!x.read_at && <span aria-label="New" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "var(--c-violet)", marginRight: 6 }} />}
                  {when(x.created_at, now)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
