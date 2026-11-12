import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { loadCreatorTasks, walletBalance } from "@/lib/creator";
import { TaskList } from "@/components/creator/TaskList";
import { TIER_NAMES } from "@/lib/tasks";

export const metadata: Metadata = { title: "Creator overview" };

export default async function CreatorHome({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const me = await requireProfile();
  const db = createAdminClient();
  const tasks = await loadCreatorTasks(me.id);
  const ids = tasks.map((t) => t.id);
  const [balance, escrowRes] = await Promise.all([
    walletBalance(me.id),
    ids.length ? db.from("ledger_accounts").select("owner_id, balance_kobo").eq("type", "task_escrow").in("owner_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const locked = ((escrowRes.data ?? []) as { balance_kobo: number }[]).reduce((s, r) => s + Number(r.balance_kobo), 0);
  const waiting = tasks.reduce((s, t) => s + t.waiting, 0);
  const first = me.full_name?.split(" ")[0] ?? "there";

  return (
    <>
      {reset && (
        <div className="c-note" role="status">
          <Icon name="check" size={18} />
          <span>Your new password is saved. Use it next time you sign in.</span>
        </div>
      )}
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
        <Link href="/create/review" className="c-card"
          style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", border: "2px solid var(--c-ink)" }}>
          <span className="c-row-main">
            <span className="c-row-title">{waiting} response{waiting === 1 ? "" : "s"} to review</span>
            <span className="c-small">Anything you don&rsquo;t decide in time is approved and paid automatically.</span>
          </span>
          <Icon name="chev" size={18} />
        </Link>
      )}

      <Link href="/create/new" className="c-btn c-btn-primary c-btn-block hide-wide"><Icon name="plus" size={18} stroke={2.2} /> Post a task</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2 className="c-sec">Recent tasks</h2>
        {tasks.length > 5 && <Link href="/create/tasks" className="c-link">See all {tasks.length} tasks</Link>}
      </div>
      {tasks.length === 0 ? (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="users" size={30} /></span>
          <h3 className="c-h2">Ask real people anything</h3>
          <p className="c-sub" style={{ maxWidth: 380 }}>Post a survey, quick review or labelling job. You only pay for work that passes your checks, and unused money comes back.</p>
        </div>
      ) : <TaskList tasks={tasks.slice(0, 5)} />}
    </>
  );
}
