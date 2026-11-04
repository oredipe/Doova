import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { nowMs } from "@/lib/time";
import { feeKobo, FLAG, loadOwnTask, shortName, TASK_STATUS, testMode } from "@/lib/creator";
import type { Answers } from "@/lib/tasks";
import { closeTask, testApproveTask } from "./actions";

export const metadata: Metadata = { title: "Your task" };

type Sub = { id: string; status: string; submitted_at: string | null; reviewed_at: string | null; auto_approved: boolean;
  answers: Answers | null; checks: { failed?: string[]; seconds?: number } | null; users: { full_name: string | null; level: number } | null };


export default async function CreatorTaskPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string; funded?: string; closed?: string; reviewed?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireProfile();
  const now = nowMs();
  const t = await loadOwnTask(id, me);
  const db = createAdminClient();
  const [{ data: subsData }, { data: escrow }] = await Promise.all([
    db.from("submissions").select("id, status, submitted_at, reviewed_at, auto_approved, answers, checks, users!submissions_doer_id_fkey(full_name, level)")
      .eq("task_id", id).order("submitted_at", { ascending: true }).limit(5000),
    db.from("ledger_accounts").select("balance_kobo").eq("type", "task_escrow").eq("owner_id", id).maybeSingle(),
  ]);
  const subs = (subsData ?? []) as unknown as Sub[];
  const by = (s: string[]) => subs.filter((x) => s.includes(x.status));
  const approved = by(["approved"]), waiting = by(["submitted"]), rejected = by(["rejected", "rejected_final", "appealed"]);
  const inProgress = subs.filter((x) => x.status === "reserved");
  const st = TASK_STATUS[t.status] ?? TASK_STATUS.draft;
  const tab = sp.tab === "results" ? "results" : sp.tab === "details" ? "details" : "review";
  const pct = Math.round((approved.length / t.slots) * 100);
  const due = (s: Sub) => new Date(new Date(s.submitted_at!).getTime() + t.auto_approve_hours * 3600_000);
  const hoursLeft = (s: Sub) => Math.max(0, Math.round((due(s).getTime() - now) / 3600_000));

  return (
    <>
      <Link href="/create" className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none" }}>
        <Icon name="back" size={16} stroke={2} /> Overview
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className={st.pill} style={{ alignSelf: "flex-start" }}>{st.label}</span>
        <h1 className="c-title">{t.title}</h1>
        <span className="c-small">{naira(t.reward_kobo)} a slot · {t.review_mode === "auto" ? "paid automatically when checks pass" : "you review every response"} · closes {new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(t.ends_at))}</span>
      </div>

      {sp.funded && t.status === "under_moderation" && (
        <div className="c-note" role="status"><Icon name="check" size={18} /><span>{naira(t.reward_kobo * t.slots + (t.fee_kobo ?? feeKobo(t.reward_kobo * t.slots)))} is locked. Doova is checking your task now, usually within 4 hours, then it goes live.</span></div>
      )}
      {sp.closed && <div className="c-note" role="status"><Icon name="check" size={18} /><span>Task closed. Unused rewards come back to your Creator funds as the last responses are decided.</span></div>}
      {sp.reviewed && <div className="c-note" role="status"><Icon name="check" size={18} /><span>All caught up. Nothing waiting for you on this task.</span></div>}
      {sp.error && <p className="c-error" role="alert">{sp.error}</p>}

      {t.status === "under_moderation" && testMode() && (
        <form action={testApproveTask.bind(null, id)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="c-small">Test mode: until the admin dashboard is built, you can approve your own task here.</span>
          <button className="c-btn c-btn-quiet">Approve as Doova (test mode)</button>
        </form>
      )}

      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>{approved.length} of {t.slots} approved</strong>
          <span className="c-small">{naira(Number(escrow?.balance_kobo ?? 0))} still locked</span>
        </div>
        <div className="c-bar"><span style={{ width: `${pct}%` }} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[["Waiting for you", waiting.length], ["Doing it now", inProgress.length], ["Not approved", rejected.length], ["Slots left", Math.max(0, t.slots - approved.length - waiting.length - inProgress.length - rejected.filter((r) => r.status !== "rejected_final").length)]].map(([l, v]) => (
            <span key={l as string} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{v as number}</span><span className="c-small">{l as string}</span>
            </span>
          ))}
        </div>
      </section>

      <nav className="c-tabs" aria-label="Task sections">
        <Link className="c-tab" href={`/create/tasks/${id}?tab=review`} aria-current={tab === "review" ? "page" : undefined}>Responses</Link>
        <Link className="c-tab" href={`/create/tasks/${id}?tab=results`} aria-current={tab === "results" ? "page" : undefined}>Results</Link>
        <Link className="c-tab" href={`/create/tasks/${id}?tab=details`} aria-current={tab === "details" ? "page" : undefined}>Details</Link>
      </nav>

      {tab === "review" && (
        <>
          <h2 className="c-sec">Needs you · {waiting.length}</h2>
          {waiting.length === 0 ? (
            <div className="c-card"><p className="c-sub">Nothing to review. {t.review_mode === "auto" ? "Responses that pass the checks are paid automatically; only the ones that fail come here." : "New responses appear here as people submit."}</p></div>
          ) : (
            <div className="c-group">
              {waiting.map((s) => (
                <Link key={s.id} href={`/create/tasks/${id}/review/${s.id}`} className="c-row">
                  <span className="c-ico" style={{ background: "var(--c-paid-soft)", fontWeight: 700, fontSize: 13 }}>{shortName(s.users?.full_name ?? null).slice(0, 2).toUpperCase()}</span>
                  <span className="c-row-main">
                    <span className="c-row-title">{shortName(s.users?.full_name ?? null)}</span>
                    <span className="c-small">Level {s.users?.level ?? 1}{s.checks?.seconds ? ` · took ${Math.max(1, Math.round(s.checks.seconds / 60))} min` : ""} · approves itself in {hoursLeft(s)} h</span>
                    {(s.checks?.failed ?? []).map((f) => <span key={f} className="c-pill c-pill-bad" style={{ alignSelf: "flex-start" }}>{FLAG[f] ?? f}</span>)}
                  </span>
                  <Icon name="chev" size={16} />
                </Link>
              ))}
            </div>
          )}
          <h2 className="c-sec">Approved · {approved.length}</h2>
          {approved.length > 0 && (
            <div className="c-group">
              {approved.slice(-20).reverse().map((s) => (
                <Link key={s.id} href={`/create/tasks/${id}/review/${s.id}`} className="c-row">
                  <span className="c-row-main">
                    <span className="c-row-title" style={{ fontSize: 15 }}>{shortName(s.users?.full_name ?? null)}</span>
                    <span className="c-small">{s.auto_approved ? "Paid automatically" : "You approved"}</span>
                  </span>
                  <span className="c-pill c-pill-lime">Paid</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "results" && <Results t={t} subs={approved} id={id} />}

      {tab === "details" && (
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="c-sub" style={{ color: "var(--c-ink)" }}>{t.instructions}</p>
          <span className="c-small">About {t.estimated_minutes} min · each person has {t.attempt_minutes} min · review window {t.auto_approve_hours} h</span>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {(t.form_schema?.questions ?? []).map((q) => (
              <li key={q.id}>{q.label}{q.check ? <span className="c-small"> · attention check: &ldquo;{q.check.answer}&rdquo;</span> : null}</li>
            ))}
          </ol>
        </section>
      )}

      {["live", "paused", "filled"].includes(t.status) && (
        <form action={closeTask.bind(null, id)}>
          <button className="c-btn c-btn-quiet c-btn-block">Close this task now</button>
        </form>
      )}
    </>
  );
}

function Results({ t, subs, id }: { t: Awaited<ReturnType<typeof loadOwnTask>>; subs: Sub[]; id: string }) {
  const qs = t.form_schema?.questions ?? [];
  if (subs.length === 0) return <div className="c-card"><p className="c-sub">Results appear here as responses are approved.</p></div>;
  return (
    <>
      <a href={`/api/tasks/${id}/export`} className="c-btn c-btn-quiet" style={{ alignSelf: "flex-start" }}><Icon name="download" size={18} /> Download all answers (CSV)</a>
      {qs.map((q, i) => {
        const vals = subs.map((s) => s.answers?.[q.id]).filter((v) => v !== undefined && v !== "");
        let body: React.ReactNode;
        if (q.type === "single_choice" || q.type === "multi_choice") {
          const counts = (q.options ?? []).map((o) => ({ o, n: vals.filter((v) => (Array.isArray(v) ? v.includes(o) : v === o)).length }));
          const max = Math.max(1, ...counts.map((c) => c.n));
          body = counts.sort((a, b) => b.n - a.n).map((c) => (
            <div key={c.o} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 3rem", gap: 10, alignItems: "center" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 14 }}>{c.o}</span>
                <span className="c-bar"><span style={{ width: `${(c.n / max) * 100}%` }} /></span>
              </span>
              <span style={{ fontWeight: 650, textAlign: "right" }}>{Math.round((c.n / Math.max(1, vals.length)) * 100)}%</span>
            </div>
          ));
        } else if (q.type === "rating") {
          const nums = vals.map(Number).filter((n) => n >= 1);
          const avg = nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
          body = <span><strong style={{ fontSize: 24 }}>{avg.toFixed(1)}</strong> <span className="c-small">average of {nums.length} (1–5)</span></span>;
        } else {
          body = vals.slice(-5).reverse().map((v, j) => <p key={j} style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "var(--c-ground)", fontSize: 14, lineHeight: 1.5 }}>{String(v)}</p>);
        }
        return (
          <section key={q.id} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="c-small">Question {i + 1} · {vals.length} answer{vals.length === 1 ? "" : "s"}</span>
            <strong>{q.label}</strong>
            {body}
          </section>
        );
      })}
    </>
  );
}
