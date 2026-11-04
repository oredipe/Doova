import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { initialsOf, naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { FLAG } from "@/lib/creator";
import { LEVEL_NAMES, TIER_NAMES, type Answers, type FormSchema } from "@/lib/tasks";
import { ago, lagosDate, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { Top } from "../../Top";
import { decideAppeal } from "./actions";
import { AppealDecision } from "./AppealDecision";

export const metadata: Metadata = { title: "Decide an appeal" };

export default async function DecideAppeal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireStaff("appeal.decide");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = nowMs();
  const db = createAdminClient();
  const { data: a } = await db.from("appeals").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();
  const { data: s } = await db.from("submissions").select("*").eq("id", a.submission_id).maybeSingle();
  const { data: t } = await db.from("tasks").select("id, title, reward_kobo, kind, needs_laptop, instructions, form_schema, creator_type, creator_id").eq("id", s!.task_id).maybeSingle();
  if (!s || !t) notFound();
  const schema = (t.form_schema ?? { questions: [] }) as FormSchema;
  const answers = (s.answers ?? {}) as Answers;
  const checks = (s.checks ?? {}) as { failed?: string[]; seconds?: number };

  const [doerRes, doerSubs, doerAppeals, creatorRes, creatorSubs, creatorAppeals, deciderRes] = await Promise.all([
    db.from("users").select("full_name, level, kyc_tier, created_at").eq("id", s.doer_id).maybeSingle(),
    db.from("submissions").select("status").eq("doer_id", s.doer_id).in("status", ["approved", "rejected", "rejected_final", "appealed"]),
    db.from("appeals").select("id, status, submissions!inner(doer_id)").eq("submissions.doer_id", s.doer_id).neq("id", id),
    t.creator_type === "org" ? db.from("organizations").select("name").eq("id", t.creator_id).maybeSingle()
      : db.from("users").select("full_name, creator_tier").eq("id", t.creator_id).maybeSingle(),
    db.from("submissions").select("status, tasks!inner(creator_type, creator_id)").eq("tasks.creator_type", t.creator_type).eq("tasks.creator_id", t.creator_id)
      .in("status", ["approved", "rejected", "rejected_final", "appealed"]).limit(5000),
    db.from("appeals").select("status, submissions!inner(tasks!inner(creator_type, creator_id))").eq("submissions.tasks.creator_type", t.creator_type).eq("submissions.tasks.creator_id", t.creator_id),
    a.decided_by_user_id ? db.from("users").select("full_name").eq("id", a.decided_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const doer = (doerRes.data ?? {}) as { full_name: string | null; level: number; kyc_tier: number };
  const doerName = doer.full_name ?? "The doer";
  const ds = doerSubs.data ?? [];
  const approvedPct = ds.length ? Math.round((ds.filter((x) => x.status === "approved").length / ds.length) * 100) : null;
  const cr = (creatorRes.data ?? {}) as { full_name?: string | null; name?: string; creator_tier?: number };
  const creatorName = cr.full_name ?? cr.name ?? "The creator";
  const cs = creatorSubs.data ?? [];
  const rejectPct = cs.length ? Math.round((cs.filter((x) => x.status !== "approved").length / cs.length) * 100) : null;
  const ca = creatorAppeals.data ?? [];
  const due = new Date(a.created_at).getTime() + 24 * 3600_000;
  const open = a.status === "open";

  return (
    <>
      <Top title="Decide an appeal" sub={`Appealed ${lagosDate(a.created_at)}${open ? ` · ${due > now ? `decide within ${ago(now, due)}` : `overdue by ${ago(due, now)}`}` : ""}`}
        back={{ href: "/admin/disputes", label: "Disputes" }} />
      <div className="ad-body">
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
        {!open && (
          <div className="c-note" role="status"><Icon name="info" size={18} />
            <span>{a.status === "upheld_for_doer" ? "Overturned and paid" : "Rejection kept"} by {deciderRes.data?.full_name ?? "staff"} on {lagosDate(a.decided_at)}: &ldquo;{a.decision_note}&rdquo;</span></div>
        )}
        <div className="ad-two">
          <div className="ad-col">
            <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="c-pill c-pill-active">Appeal</span>
                <span className="c-small">{t.title} · {naira(t.reward_kobo)}{t.needs_laptop ? " · laptop task" : ""}</span>
              </span>
              <h2 className="c-h1" style={{ margin: 0 }}>{doerName} says this was rejected unfairly</h2>
              <div className="ad-quote"><span className="c-small"><strong style={{ color: "var(--c-ink)" }}>{creatorName} rejected it</strong> · {s.reviewed_at ? lagosDate(s.reviewed_at) : ""}</span>
                <span>&ldquo;{s.reject_reason}&rdquo;</span></div>
              <div className="ad-quote ad-quote-doer"><span className="c-small"><strong style={{ color: "var(--c-ink)" }}>{doerName.split(" ")[0]} appealed</strong> · {lagosDate(a.created_at)}</span>
                <span>&ldquo;{a.reason}&rdquo;</span></div>
              <h3 className="c-h2" style={{ fontSize: 17, marginTop: 6 }}>The work</h3>
              {checks.failed?.length ? <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{checks.failed.map((f) => <span key={f} className="c-pill c-pill-bad">{FLAG[f] ?? f}</span>)}</span>
                : <span className="c-pill c-pill-lime" style={{ alignSelf: "flex-start" }}>Passed Doova&rsquo;s automatic checks</span>}
              {s.answers_purged_at ? <p className="c-sub">The answers were cleared under the data retention rule.</p> : (
                <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {schema.questions.map((q, i) => {
                    const v = answers[q.id];
                    const shown = Array.isArray(v) ? v.join(", ") : v ?? "";
                    const wrong = q.check && String(v ?? "") !== q.check.answer;
                    return (
                      <li key={q.id} className="ad-check">
                        <span className="ad-dot" style={{ background: "#F2F2EC", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span className="c-small">{q.label}{q.check ? ` · attention check, right answer “${q.check.answer}”` : ""}</span>
                          <span style={{ whiteSpace: "pre-wrap", color: wrong ? "var(--c-bad)" : undefined, fontWeight: 500 }}>{shown || "—"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <h3 className="c-h2" style={{ fontSize: 17, marginTop: 6 }}>Timeline</h3>
              <div>
                <div className="ad-kv"><span>Started</span><span>{s.reserved_at ? lagosDate(s.reserved_at) : "—"}</span></div>
                <div className="ad-kv"><span>Submitted</span><span>{s.submitted_at ? lagosDate(s.submitted_at) : "—"}{checks.seconds ? ` · ${Math.max(1, Math.round(checks.seconds / 60))} min` : ""}</span></div>
                <div className="ad-kv"><span>Rejected by {creatorName}</span><span>{s.reviewed_at ? lagosDate(s.reviewed_at) : "—"}</span></div>
                <div className="ad-kv"><span>Appealed</span><span>{lagosDate(a.created_at)}</span></div>
                {open && <div className="ad-kv"><span>Decide by</span><span>{lagosDate(new Date(due))}</span></div>}
              </div>
            </section>
          </div>
          <div className="ad-col">
            {open && (
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 12 }}>Your decision</h2>
                <AppealDecision action={decideAppeal.bind(null, id)} reward={naira(t.reward_kobo)} doer={doerName} />
              </section>
            )}
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Money</h2>
              <div className="ad-kv"><span>Reward</span><span>{naira(t.reward_kobo)}</span></div>
              <div className="ad-kv"><span>Where it is now</span><span>{open ? "Locked in the task" : a.status === "upheld_for_doer" ? `Paid to ${doerName.split(" ")[0]}` : "Back in the task"}</span></div>
              {open && <><div className="ad-kv"><span>If you overturn</span><span>Paid to {doerName.split(" ")[0]}</span></div>
                <div className="ad-kv"><span>If you keep the rejection</span><span>Slot reopens</span></div></>}
            </section>
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 10 }}>{doerName}</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                <span className="c-ico" style={{ background: "var(--c-paid-soft)", fontWeight: 700, fontSize: 13 }}>{initialsOf(doerName)}</span>
                <span className="c-small">Doer · Level {doer.level} {LEVEL_NAMES[doer.level]} · {doer.kyc_tier ? "NIN checked" : "phone checked"}</span>
              </div>
              <div className="ad-kv"><span>Approved work</span><span>{approvedPct === null ? "None yet" : `${approvedPct}% · ${ds.filter((x) => x.status === "approved").length} of ${ds.length}`}</span></div>
              <div className="ad-kv"><span>Appeals before</span><span>{doerAppeals.data?.length ? `${doerAppeals.data.length} · ${doerAppeals.data.filter((x) => x.status === "upheld_for_doer").length} won` : "None"}</span></div>
              <Link href={`/admin/users/${s.doer_id}`} style={{ display: "inline-block", marginTop: 10, color: "var(--c-ink)", fontWeight: 600 }}>Open their account</Link>
            </section>
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 10 }}>{creatorName}</h2>
              <span className="c-small">Creator{cr.creator_tier ? ` · Tier ${cr.creator_tier} ${TIER_NAMES[cr.creator_tier]}` : ""}</span>
              <div className="ad-kv" style={{ borderTop: 0 }}><span>Rejects doers&rsquo; work</span><span>{rejectPct === null ? "—" : `${rejectPct}% of ${cs.length}`}</span></div>
              <div className="ad-kv"><span>Appeals against them</span><span>{ca.length} · {ca.filter((x) => x.status === "upheld_for_doer").length} overturned</span></div>
              {t.creator_type === "user" && <Link href={`/admin/users/${t.creator_id}`} style={{ display: "inline-block", marginTop: 10, color: "var(--c-ink)", fontWeight: 600 }}>Open their account</Link>}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
