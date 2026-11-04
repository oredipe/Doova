import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ScrollToTop } from "@/components/ScrollToTop";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { creatorSummary, LEVEL_NAMES, LEVEL_XP, loadTask } from "@/lib/tasks";
import { appealRejection } from "../actions";

export const metadata: Metadata = { title: "Task result" };

function when(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));
}

export default async function DonePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireProfile();
  const task = await loadTask(id);
  if (!task) notFound();
  const db = createAdminClient();
  const { data: sub } = await db.from("submissions")
    .select("id, status, submitted_at, reject_reason, auto_approved, appeal_deadline, checks")
    .eq("task_id", id).eq("doer_id", me.id).maybeSingle();
  if (!sub) redirect(`/tasks/${id}`);
  if (sub.status === "reserved") redirect(`/tasks/${id}/do`);

  const creator = await creatorSummary(task);
  const actions = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ScrollToTop />
      <Link href="/tasks" className="c-btn c-btn-primary c-btn-block">Back to tasks</Link>
      <Link href="/my-tasks" className="c-btn c-btn-quiet c-btn-block">My tasks</Link>
    </div>
  );

  if (sub.status === "approved") {
    const [{ data: xpRows }, { data: wallet }, { data: next }, { data: appeal }] = await Promise.all([
      db.from("xp_events").select("points").eq("user_id", me.id).eq("source_id", sub.id),
      db.from("v_wallet_balances").select("balance_kobo").eq("owner_type", "user").eq("owner_id", me.id).eq("purse", "earnings").maybeSingle(),
      db.from("v_task_feed").select("id, title, reward_kobo, estimated_minutes, creator_name").gt("slots_left", 0).neq("id", id)
        .lte("reward_kobo", [0, 150000, 300000, 500000, 1000000, 1e12][me.level]).order("went_live_at", { ascending: false }).limit(5),
      db.from("appeals").select("status").eq("submission_id", sub.id).maybeSingle(),
    ]);
    const { data: done } = await db.from("submissions").select("task_id").eq("doer_id", me.id);
    const tried = new Set((done ?? []).map((d) => d.task_id));
    const up = (next ?? []).find((t) => !tried.has(t.id));
    const gained = (xpRows ?? []).reduce((s, r) => s + r.points, 0);
    const nextLevel = Math.min(me.level + 1, 5);
    const pct = me.level >= 5 ? 100 : Math.min(100, Math.round(((me.xp - LEVEL_XP[me.level]) / (LEVEL_XP[nextLevel] - LEVEL_XP[me.level])) * 100));

    return (
      <>
        <section className="paid-head" aria-live="polite">
          <span style={{ fontWeight: 650 }}>Paid</span>
          <span className="paid-amount">+{naira(task.reward_kobo)}</span>
          <span style={{ fontSize: 16, lineHeight: 1.5 }}>
            {appeal?.status === "upheld_for_doer" ? "Doova staff agreed with your appeal." : sub.auto_approved ? "Your answers passed the checks." : `${creator.name} approved your work.`} The money is in your Earnings now.
          </span>
        </section>

        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Level {me.level} · {LEVEL_NAMES[me.level]}</strong>
            {gained > 0 && <span className="c-xp"><Icon name="spark" size={12} stroke={2.2} /> +{gained} XP</span>}
          </div>
          <div className="c-bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="c-small">{me.level >= 5 ? "You're at the top level." : `${me.xp} of ${LEVEL_XP[nextLevel]} XP. ${LEVEL_XP[nextLevel] - me.xp} more for Level ${nextLevel}.`}</span>
        </section>

        <section className="c-card c-dark" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="c-small">Earnings</span>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{naira(Number(wallet?.balance_kobo ?? 0))}</span>
          </span>
          <Link href="/wallet" className="c-btn c-btn-money" style={{ minHeight: 44 }}>Withdraw</Link>
        </section>

        {up && (
          <>
            <h2 className="c-sec">Up next for you</h2>
            <Link href={`/tasks/${up.id}`} className="c-card" style={{ display: "flex", gap: 14, alignItems: "center", textDecoration: "none" }}>
              <span className="c-ico" style={{ background: "var(--c-violet-soft)", color: "var(--c-violet-text)" }}><Icon name="spark" size={18} /></span>
              <span className="c-row-main">
                <span className="c-row-title">{up.title}</span>
                <span className="c-small">{up.creator_name} · about {up.estimated_minutes} min</span>
              </span>
              <span className="c-amt">{naira(up.reward_kobo)}</span>
            </Link>
          </>
        )}
        {actions}
      </>
    );
  }

  if (sub.status === "appealed") {
    return (
      <>
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 28 }}>
          <span className="empty-art" style={{ marginBottom: 0 }}><Icon name="clock" size={30} /></span>
          <h1 className="c-h1">Appeal sent</h1>
          <p className="c-sub" style={{ color: "var(--c-ink)" }}>
            Doova staff, not the creator, will look at your work, the creator&rsquo;s reason and your appeal, and decide within 24 hours.
            If they agree with you, your {naira(task.reward_kobo)} is paid straight away.
          </p>
          <span className="c-pill c-pill-paid" style={{ alignSelf: "flex-start" }}><Icon name="lock" size={12} stroke={2.2} /> {naira(task.reward_kobo)} stays locked until then</span>
        </section>
        {actions}
      </>
    );
  }

  if (sub.status === "submitted") {
    const due = new Date(new Date(sub.submitted_at).getTime() + task.auto_approve_hours * 3600_000).toISOString();
    return (
      <>
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 28 }}>
          <span className="empty-art" style={{ marginBottom: 0 }}><Icon name="clock" size={30} /></span>
          <h1 className="c-h1">Submitted. Waiting for review.</h1>
          <p className="c-sub" style={{ color: "var(--c-ink)" }}>
            {creator.name} checks this work. If they don&rsquo;t decide by <strong>{when(due)}</strong>, it&rsquo;s approved and your {naira(task.reward_kobo)} is paid automatically.
          </p>
          <span className="c-pill c-pill-paid" style={{ alignSelf: "flex-start" }}><Icon name="lock" size={12} stroke={2.2} /> {naira(task.reward_kobo)} is locked for you</span>
        </section>
        {actions}
      </>
    );
  }

  if (sub.status === "rejected" || sub.status === "rejected_final") {
    const { data: decided } = await db.from("appeals").select("status, decision_note").eq("submission_id", sub.id).maybeSingle();
    return (
      <>
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 28 }}>
          <h1 className="c-h1">Not approved</h1>
          <p className="c-sub">The creator gave this reason:</p>
          <p style={{ margin: 0, background: "var(--c-ground)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.5 }}>&ldquo;{sub.reject_reason}&rdquo;</p>
          {decided?.status === "upheld_for_creator" && (
            <>
              <p className="c-sub" style={{ margin: 0 }}>You appealed. Doova staff looked at it and kept the rejection:</p>
              <p style={{ margin: 0, background: "var(--c-violet-soft)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.5 }}>&ldquo;{decided.decision_note}&rdquo;</p>
            </>
          )}
          {sub.status === "rejected_final" && <p className="c-small" style={{ margin: 0 }}>This decision is final.</p>}
        </section>
        {sub.status === "rejected" && sub.appeal_deadline && new Date(sub.appeal_deadline) > new Date(sub.submitted_at) && (
          <form action={appealRejection.bind(null, id)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="c-h2">Think this is unfair?</h2>
            <p className="c-sub" style={{ margin: 0 }}>
              You can appeal once, until {when(sub.appeal_deadline)}. Doova staff decide within 24 hours. The {naira(task.reward_kobo)} stays locked until they do.
            </p>
            <label className="c-field">
              <span className="c-label">Why should this work be approved?</span>
              <textarea name="reason" className="c-input" rows={4} required minLength={20} maxLength={1000} style={{ padding: 14, lineHeight: 1.5 }}
                placeholder="Say which part of the reason is wrong, e.g. which answer and why it follows the instructions" />
            </label>
            {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
            <button className="c-btn c-btn-primary c-btn-block">Send appeal</button>
          </form>
        )}
        {actions}
      </>
    );
  }

  return (
    <>
      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 28 }}>
        <h1 className="c-h1">{sub.status === "expired" ? "Time ran out" : "You left this task"}</h1>
        <p className="c-sub">The slot went back for someone else. {creator.slotsLeft > 0 ? "There are still slots, so you can start again." : ""}</p>
      </section>
      {creator.slotsLeft > 0 && <Link href={`/tasks/${id}`} className="c-btn c-btn-primary c-btn-block">Try again</Link>}
      {actions}
    </>
  );
}
