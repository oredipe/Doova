import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { initialsOf, naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { highlight, MODERATION_REASONS, runModerationChecks } from "@/lib/moderation";
import { TIER_NAMES, type FormSchema } from "@/lib/tasks";
import { ago, lagosDate, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { Top } from "../../Top";
import { decideTask } from "./actions";
import { Decision } from "./Decision";

export const metadata: Metadata = { title: "Check a task" };

const KIND: Record<string, string> = { survey: "Survey", review: "Review", labelling: "Labelling", app_test: "App test", other: "Other" };
const QTYPE: Record<string, string> = { single_choice: "One choice", multi_choice: "Several choices", rating: "Rating", short_text: "Short answer", long_text: "Written answer" };

export default async function CheckTask({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireStaff("task.moderate");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = nowMs();
  const db = createAdminClient();
  const { data } = await db.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Record<string, unknown> & { id: string; title: string; instructions: string; kind: string; status: string; reward_kobo: number; slots: number;
    fee_kobo: number | null; escrow_kobo: number; estimated_minutes: number; needs_laptop: boolean; requires_nda: boolean; review_mode: string;
    creator_type: "user" | "org"; creator_id: string; funded_at: string | null; went_live_at: string | null; moderation_note: string | null;
    moderated_at: string | null; moderated_by: string | null; eligibility: Record<string, unknown>; form_schema: FormSchema | null; created_at: string };

  const [creatorRes, pastRes, subsRes, payRes, modByRes] = await Promise.all([
    t.creator_type === "org"
      ? db.from("organizations").select("name, created_at").eq("id", t.creator_id).maybeSingle()
      : db.from("users").select("full_name, created_at, creator_tier, kyc_tier, status").eq("id", t.creator_id).maybeSingle(),
    db.from("tasks").select("id, went_live_at, moderated_at").eq("creator_type", t.creator_type).eq("creator_id", t.creator_id).not("funded_at", "is", null).neq("id", id),
    db.from("submissions").select("status, tasks!inner(creator_type, creator_id)").eq("tasks.creator_type", t.creator_type).eq("tasks.creator_id", t.creator_id)
      .in("status", ["approved", "rejected", "rejected_final", "appealed"]).limit(5000),
    db.from("ledger_transactions").select("created_at").eq("idempotency_key", "fund:" + id).maybeSingle(),
    t.moderated_by ? db.from("users").select("full_name").eq("id", t.moderated_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = (creatorRes.data ?? {}) as { full_name?: string | null; name?: string; created_at?: string; creator_tier?: number; kyc_tier?: number; status?: string };
  const creatorName = c.full_name ?? c.name ?? "Creator";
  const past = pastRes.data ?? [];
  const turnedDown = past.filter((p) => p.moderated_at && !p.went_live_at).length;
  const decidedSubs = subsRes.data ?? [];
  const rejectedPct = decidedSubs.length ? Math.round((decidedSubs.filter((s) => s.status !== "approved").length / decidedSubs.length) * 100) : null;
  const checks = runModerationChecks(t);
  const flaggedWords = checks.flatMap((x) => (x.ok ? [] : x.matches ?? []));
  const fee = t.fee_kobo ?? 0;
  const waiting = t.status === "under_moderation";
  const elig = t.eligibility ?? {};
  const chips = [KIND[t.kind] ?? t.kind, `${naira(t.reward_kobo)} a slot`, `About ${t.estimated_minutes} min`, `${t.slots} slots`,
    t.review_mode === "auto" ? "Paid automatically" : "Creator reviews",
    ...(t.needs_laptop ? ["Laptop"] : []), ...(t.requires_nda ? ["NDA"] : []),
    ...(Array.isArray(elig.states) && elig.states.length ? [(elig.states as string[]).join(", ")] : []),
    ...(elig.min_age ? [`Age ${elig.min_age}+`] : [])];
  const fundedAt = t.funded_at ?? payRes.data?.created_at ?? null;

  return (
    <>
      <Top title="Check a task" sub={fundedAt ? `Funded ${lagosDate(fundedAt)}${waiting ? ` · waiting ${ago(new Date(fundedAt).getTime(), now)}` : ""}` : undefined}
        back={{ href: "/admin/tasks", label: "Task approvals" }} />
      <div className="ops-body">
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
        {!waiting && (
          <div className="c-note" role="status">
            <Icon name="info" size={18} />
            <span>{t.moderated_at
              ? `${t.went_live_at ? "Approved" : "Turned down"} by ${modByRes.data?.full_name ?? "staff"} on ${lagosDate(t.moderated_at)}${t.moderation_note ? `: “${t.moderation_note}”` : "."}`
              : t.went_live_at ? "This task went live without staff review (approved before the admin dashboard, or skipped by a setting)." : `This task isn't waiting for a check (status: ${t.status.replace(/_/g, " ")}).`}</span>
          </div>
        )}
        <div className="ops-two">
          <div className="ops-col">
            <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span className="c-small">As doers will see it</span>
              <h2 className="c-h1" style={{ margin: 0 }}>{highlight(t.title, flaggedWords).map((p, i) => typeof p === "string" ? p : <mark key={i} className="ops-flagged">{p.flag}</mark>)}</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{chips.map((x) => <span key={x} className="c-pill c-pill-quiet">{x}</span>)}</div>
              <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {highlight(t.instructions, flaggedWords).map((p, i) => typeof p === "string" ? p : <mark key={i} className="ops-flagged">{p.flag}</mark>)}
              </p>
              <h3 className="c-h2" style={{ fontSize: 17, marginTop: 6 }}>Questions ({t.form_schema?.questions.length ?? 0})</h3>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
                {(t.form_schema?.questions ?? []).map((q, i) => (
                  <li key={q.id} className="ops-check">
                    <span className="ops-dot" style={{ background: "#F2F2EC", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{highlight(q.label, flaggedWords).map((p, j) => typeof p === "string" ? p : <mark key={j} className="ops-flagged">{p.flag}</mark>)}</span>
                      <span className="c-small">
                        {q.check ? "Attention check · " : ""}{QTYPE[q.type] ?? q.type}
                        {q.options?.length ? `: ${q.options.join(", ")}` : q.type === "rating" ? ` 1 to ${q.scale ?? 5}` : ""}
                        {q.check ? ` · right answer “${q.check.answer}”` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 4 }}>Automatic checks</h2>
              {checks.map((x) => (
                <div key={x.title} className="ops-check">
                  <span className={x.ok ? "ops-dot ops-dot-ok" : x.warn ? "ops-dot" : "ops-dot ops-dot-bad"} style={x.ok || !x.warn ? undefined : { background: "#ECECE6" }}>
                    <Icon name={x.ok ? "check" : x.warn ? "info" : "x"} size={14} stroke={2.4} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{x.title}</strong><span className="c-small">{x.detail}</span></span>
                </div>
              ))}
            </section>
          </div>
          <div className="ops-col">
            {waiting && (
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 12 }}>Your decision</h2>
                <Decision action={decideTask.bind(null, id)} refund={naira(t.escrow_kobo + fee)} creator={creatorName}
                  reasons={MODERATION_REASONS} flagged={checks.some((x) => !x.ok && !x.warn)} />
              </section>
            )}
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 12 }}>Creator</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                <span className="c-ico" style={{ background: "#F2F2EC", fontWeight: 700, fontSize: 13 }}>{initialsOf(creatorName)}</span>
                <span style={{ display: "flex", flexDirection: "column" }}><strong>{creatorName}</strong>
                  <span className="c-small">{t.creator_type === "org" ? "Business" : "Person"}{c.kyc_tier ? " · NIN checked" : " · phone checked"}{c.status && c.status !== "active" ? ` · ${c.status}` : ""}</span></span>
              </div>
              {t.creator_type === "user" && <div className="ops-kv"><span>Tier</span><span>{c.creator_tier ?? 1} · {TIER_NAMES[c.creator_tier ?? 1]}</span></div>}
              <div className="ops-kv"><span>Past tasks</span><span>{past.length}{past.length ? ` · ${turnedDown ? `${turnedDown} turned down by Doova` : "none turned down"}` : ""}</span></div>
              <div className="ops-kv"><span>Rejects doers&rsquo; work</span><span>{rejectedPct === null ? "No reviews yet" : `${rejectedPct}% of ${decidedSubs.length}`}</span></div>
              {c.created_at && <div className="ops-kv"><span>Member since</span><span>{lagosDate(c.created_at, { day: "numeric", month: "long", year: "numeric" })}</span></div>}
              {t.creator_type === "user" && <Link href={`/admin/users/${t.creator_id}`} style={{ display: "inline-block", marginTop: 10, color: "var(--c-ink)", fontWeight: 600 }}>Open creator&rsquo;s account</Link>}
            </section>
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Money</h2>
              <div className="ops-kv"><span>Rewards locked</span><span>{naira(t.escrow_kobo)}</span></div>
              <div className="ops-kv"><span>Doova fee ({Math.round((Number(t.fee_bps ?? 1500)) / 100)}%)</span><span>{naira(fee)}</span></div>
              <div className="ops-kv"><span>Paid from Creator funds</span><span>{naira(t.escrow_kobo + fee)}</span></div>
              {waiting && <div className="ops-kv"><span>If turned down</span><span>{naira(t.escrow_kobo + fee)} back to them</span></div>}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
