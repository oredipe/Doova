import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { TaskResults } from "@/components/TaskResults";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, lagosDate, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { FLAG, TASK_STATUS } from "@/lib/creator";
import { loadDoovaTask } from "@/lib/doova";
import type { Answers } from "@/lib/tasks";
import { Top } from "../../Top";
import { closeDoovaTask } from "../actions";

export const metadata: Metadata = { title: "Doova task" };

type Sub = { id: string; status: string; submitted_at: string | null; auto_approved: boolean; answers: Answers | null;
  checks: { failed?: string[]; seconds?: number } | null; users: { full_name: string | null; level: number } | null };

export default async function DoovaTaskPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; done?: string; error?: string; reviewed?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireStaff("task.moderate");
  const now = nowMs();
  const t = await loadDoovaTask(id);
  const db = createAdminClient();
  const [{ data: subsData }, { data: escrow }, { data: author }] = await Promise.all([
    db.from("submissions").select("id, status, submitted_at, auto_approved, answers, checks, users!submissions_doer_id_fkey(full_name, level)")
      .eq("task_id", id).order("submitted_at", { ascending: true }).limit(5000),
    db.from("ledger_accounts").select("balance_kobo").eq("type", "task_escrow").eq("owner_id", id).maybeSingle(),
    t.created_by_user_id ? db.from("users").select("full_name").eq("id", t.created_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const subs = (subsData ?? []) as unknown as Sub[];
  const by = (s: string[]) => subs.filter((x) => s.includes(x.status));
  const approved = by(["approved"]), waiting = by(["submitted"]), rejected = by(["rejected", "rejected_final", "appealed"]), doing = by(["reserved"]);
  const st = TASK_STATUS[t.status] ?? TASK_STATUS.draft;
  const tab = sp.tab === "results" ? "results" : sp.tab === "details" ? "details" : "review";
  const pct = Math.round((approved.length / t.slots) * 100);
  const hoursLeft = (s: Sub) => Math.max(0, Math.round((new Date(s.submitted_at!).getTime() + t.auto_approve_hours * 3600_000 - now) / 3600_000));
  const reward = t.reward_kobo === 0 ? "₦0 · earns XP" : `${naira(t.reward_kobo)} a slot`;

  return (
    <>
      <Top title={t.title} sub={`${reward} · ${t.review_mode === "auto" ? "paid automatically when checks pass" : "staff review every response"} · closes ${lagosDate(t.ends_at, { day: "numeric", month: "short" })}`}
        back={{ href: "/admin/doova", label: "Doova tasks" }} />
      <div className="ops-body" style={{ maxWidth: 900 }}>
        {sp.done === "launched" && <div className="c-note" role="status"><Icon name="check" size={18} /><span>Launched. It&rsquo;s live for doers now, marked &ldquo;From Doova&rdquo;.</span></div>}
        {sp.done === "closed" && <div className="c-note" role="status"><Icon name="check" size={18} /><span>Closed. Unused rewards go back to the Doova budget as the last responses are decided.</span></div>}
        {sp.reviewed && <div className="c-note" role="status"><Icon name="check" size={18} /><span>All caught up. Nothing waiting on this task.</span></div>}
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}

        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={st.pill}>{st.label}</span><strong>{approved.length} of {t.slots.toLocaleString("en-NG")} done</strong></span>
            <span className="c-small">{naira(Number(escrow?.balance_kobo ?? 0))} still locked{author?.full_name ? ` · posted by ${author.full_name}` : ""}</span>
          </div>
          <div className="c-bar"><span style={{ width: `${pct}%` }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {([["To review", waiting.length], ["Doing it now", doing.length], ["Not approved", rejected.length], ["Slots left", !["live", "paused", "filled"].includes(t.status) ? 0 : Math.max(0, t.slots - approved.length - waiting.length - doing.length - rejected.filter((r) => r.status !== "rejected_final").length)]] as const).map(([l, v]) => (
              <span key={l} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 22, fontWeight: 700 }}>{v}</span><span className="c-small">{l}</span></span>
            ))}
          </div>
        </section>

        <nav className="c-tabs" aria-label="Task sections">
          <Link className="c-tab" href={`/admin/doova/${id}?tab=review`} aria-current={tab === "review" ? "page" : undefined}>Responses</Link>
          <Link className="c-tab" href={`/admin/doova/${id}?tab=results`} aria-current={tab === "results" ? "page" : undefined}>Results</Link>
          <Link className="c-tab" href={`/admin/doova/${id}?tab=details`} aria-current={tab === "details" ? "page" : undefined}>Details</Link>
        </nav>

        {tab === "review" && (
          <>
            <h2 className="c-sec" style={{ margin: 0 }}>To review · {waiting.length}</h2>
            {waiting.length === 0 ? (
              <div className="c-card"><p className="c-sub">Nothing to review. {t.review_mode === "auto" ? "Responses that pass the checks are approved automatically; only the ones that fail come here." : "New responses appear here as people submit."}</p></div>
            ) : (
              <div className="c-group">
                {waiting.map((s) => (
                  <Link key={s.id} href={`/admin/doova/${id}/review/${s.id}`} className="c-row">
                    <span className="c-row-main">
                      <span className="c-row-title">{s.users?.full_name ?? "Doer"}</span>
                      <span className="c-small">Level {s.users?.level ?? 1}{s.checks?.seconds ? ` · took ${Math.max(1, Math.round(s.checks.seconds / 60))} min` : ""} · approves itself in {hoursLeft(s)} h</span>
                      {(s.checks?.failed ?? []).map((f) => <span key={f} className="c-pill c-pill-bad" style={{ alignSelf: "flex-start" }}>{FLAG[f] ?? f}</span>)}
                    </span>
                    <Icon name="chev" size={16} />
                  </Link>
                ))}
              </div>
            )}
            <h2 className="c-sec" style={{ margin: 0 }}>Approved · {approved.length}</h2>
            {approved.length > 0 && (
              <div className="c-group">
                {approved.slice(-20).reverse().map((s) => (
                  <Link key={s.id} href={`/admin/doova/${id}/review/${s.id}`} className="c-row">
                    <span className="c-row-main">
                      <span className="c-row-title" style={{ fontSize: 15 }}>{s.users?.full_name ?? "Doer"}</span>
                      <span className="c-small">{s.auto_approved ? "Approved automatically" : "Approved by staff"}</span>
                    </span>
                    <span className="c-pill c-pill-lime">{t.reward_kobo === 0 ? "Done" : "Paid"}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "results" && <TaskResults questions={t.form_schema?.questions ?? []} answers={approved.map((s) => s.answers)} exportHref={`/api/tasks/${id}/export`} />}

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

        {can(me.role, "settings.update") && ["live", "paused", "filled"].includes(t.status) && (
          <form action={closeDoovaTask.bind(null, id)}>
            <button className="c-btn c-btn-quiet">Close this task now</button>
          </form>
        )}
      </div>
    </>
  );
}
