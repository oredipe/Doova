import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { TASK_STATUS, walletBalance } from "@/lib/creator";
import { TIER_NAMES } from "@/lib/tasks";

export const metadata: Metadata = { title: "Creator overview" };

type T = { id: string; title: string; status: string; reward_kobo: number; slots: number; ends_at: string; created_at: string; moderated_at: string | null; went_live_at: string | null };

export default async function CreatorHome() {
  const me = await requireProfile();
  const db = createAdminClient();
  const { data } = await db.from("tasks").select("id, title, status, reward_kobo, slots, ends_at, created_at, moderated_at, went_live_at")
    .eq("creator_type", "user").eq("creator_id", me.id).order("created_at", { ascending: false }).limit(100);
  const tasks = (data ?? []) as T[];
  const ids = tasks.map((t) => t.id);
  const [balance, subsRes, escrowRes] = await Promise.all([
    walletBalance(me.id),
    ids.length ? db.from("submissions").select("task_id, status").in("task_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("ledger_accounts").select("owner_id, balance_kobo").eq("type", "task_escrow").in("owner_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const subs = (subsRes.data ?? []) as { task_id: string; status: string }[];
  const locked = ((escrowRes.data ?? []) as { balance_kobo: number }[]).reduce((s, r) => s + Number(r.balance_kobo), 0);
  const count = (id: string, sts: string[]) => subs.filter((s) => s.task_id === id && sts.includes(s.status)).length;
  const waiting = subs.filter((s) => s.status === "submitted").length;
  const first = me.full_name?.split(" ")[0] ?? "there";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="c-small">Creator home</span>
          <h1 className="c-title">Welcome, {first}</h1>
        </div>
        <Link href="/create/settings" className="c-pill c-pill-active" style={{ textDecoration: "none" }}>{TIER_NAMES[me.creator_tier]} creator</Link>
      </div>

      <section className="c-card c-dark" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24 }}>
        <span className="c-small">Creator funds</span>
        <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em" }}>{naira(balance)}</span>
        <span className="c-small">{naira(locked)} locked in tasks</span>
      </section>

      {waiting > 0 && (
        <Link href={`/create/tasks/${subs.find((s) => s.status === "submitted")!.task_id}?tab=review`} className="c-card"
          style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", border: "2px solid var(--c-ink)" }}>
          <span className="c-row-main">
            <span className="c-row-title">{waiting} response{waiting === 1 ? "" : "s"} to review</span>
            <span className="c-small">Anything you don&rsquo;t decide in time is approved and paid automatically.</span>
          </span>
          <Icon name="chev" size={18} />
        </Link>
      )}

      <Link href="/create/new" className="c-btn c-btn-primary c-btn-block"><Icon name="plus" size={18} stroke={2.2} /> Post a task</Link>

      <h2 className="c-sec">Your tasks</h2>
      {tasks.length === 0 ? (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="users" size={30} /></span>
          <h3 className="c-h2">Ask real people anything</h3>
          <p className="c-sub" style={{ maxWidth: 380 }}>Post a survey, quick review or labelling job. You only pay for work that passes your checks, and unused money comes back.</p>
        </div>
      ) : (
        <div className="c-group">
          {tasks.map((t) => {
            const approved = count(t.id, ["approved"]);
            const pct = Math.round((approved / t.slots) * 100);
            const st = t.status === "settled" && t.moderated_at && !t.went_live_at ? TASK_STATUS.rejected_by_moderation : TASK_STATUS[t.status] ?? TASK_STATUS.draft;
            const toReview = count(t.id, ["submitted"]);
            const href = t.status === "pending_funding" ? `/create/tasks/${t.id}/fund` : `/create/tasks/${t.id}`;
            return (
              <Link key={t.id} href={href} className="c-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <span className="c-row-title">{t.title}</span>
                  <span className={st.pill}>{st.label}</span>
                </span>
                <span className="c-small">{naira(t.reward_kobo)} a slot · {approved} of {t.slots} approved{toReview ? ` · ${toReview} to review` : ""}</span>
                <span className="c-bar"><span style={{ width: `${pct}%` }} /></span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
