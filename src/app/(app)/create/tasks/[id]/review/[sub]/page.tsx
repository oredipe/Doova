import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { nowMs } from "@/lib/time";
import { FLAG, loadOwnTask, shortName } from "@/lib/creator";
import type { Answers } from "@/lib/tasks";
import { approveResponse, rejectResponse } from "../../actions";
import { ReasonPicker } from "@/components/ReasonPicker";

export const metadata: Metadata = { title: "Review a response" };

export default async function ReviewPage({ params, searchParams }: {
  params: Promise<{ id: string; sub: string }>; searchParams: Promise<{ error?: string; after?: string }>;
}) {
  const [{ id, sub }, sp] = await Promise.all([params, searchParams]);
  const me = await requireProfile();
  const now = nowMs();
  const t = await loadOwnTask(id, me);
  const db = createAdminClient();

  if (sub === "next") {
    // After a decision: go to the next response waiting for review, oldest first.
    const { data } = await db.from("submissions").select("id").eq("task_id", id).eq("status", "submitted")
      .neq("id", sp.after ?? "00000000-0000-0000-0000-000000000000").order("submitted_at", { ascending: true }).limit(1);
    if (data?.[0]) redirect(`/create/tasks/${id}/review/${data[0].id}`);
    redirect(`/create/tasks/${id}?tab=review&reviewed=1`);
  }
  if (!/^[0-9a-f-]{36}$/i.test(sub)) notFound();

  const { data: s } = await db.from("submissions")
    .select("id, status, submitted_at, answers, checks, reject_reason, users!submissions_doer_id_fkey(full_name, level)")
    .eq("id", sub).eq("task_id", id).maybeSingle();
  if (!s) notFound();
  const doer = s.users as unknown as { full_name: string | null; level: number } | null;
  const answers = (s.answers ?? {}) as Answers;
  const checks = (s.checks ?? {}) as { failed?: string[]; seconds?: number };
  const failed = checks.failed ?? [];
  const qs = t.form_schema?.questions ?? [];
  const hoursLeft = s.submitted_at ? Math.max(0, Math.round((new Date(s.submitted_at).getTime() + t.auto_approve_hours * 3600_000 - now) / 3600_000)) : 0;
  const suggested = [
    failed.includes("attention") && "You didn't choose the answer the attention question asked for.",
    failed.includes("too_fast") && "Answers were too quick to be read properly.",
    failed.includes("copied") && "Your written answer matches another person's word for word.",
    "Answers don't follow the task instructions.",
  ].filter(Boolean) as string[];

  return (
    <>
      <Link href={`/create/tasks/${id}?tab=review`} className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none" }}>
        <Icon name="back" size={16} stroke={2} /> {t.title}
      </Link>
      <section className="c-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span className="c-ico" style={{ width: 48, height: 48, background: "var(--c-paid-soft)", fontWeight: 700 }}>{shortName(doer?.full_name ?? null).slice(0, 2).toUpperCase()}</span>
        <span className="c-row-main">
          <span className="c-row-title">{shortName(doer?.full_name ?? null)}</span>
          <span className="c-small">Level {doer?.level ?? 1}{checks.seconds ? ` · took ${Math.max(1, Math.round(checks.seconds / 60))} min (you estimated ${t.estimated_minutes})` : ""}</span>
        </span>
        <span className="c-amt">{naira(t.reward_kobo)}</span>
      </section>

      {failed.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {failed.map((f) => <span key={f} className="c-pill c-pill-bad">{FLAG[f] ?? f}</span>)}
        </div>
      )}
      {s.status === "submitted" && (
        <div className="c-note"><Icon name="clock" size={18} /><span>If you don&rsquo;t decide in {hoursLeft} hours, this response is approved and paid automatically.</span></div>
      )}

      {qs.map((q, i) => {
        const a = answers[q.id];
        const text = Array.isArray(a) ? a.join(", ") : a ?? "";
        const wrong = q.check && text !== q.check.answer;
        return (
          <section key={q.id} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 8, border: wrong ? "2px solid var(--c-bad)" : undefined }}>
            <span className="c-small">Question {i + 1}{q.check ? " · attention check" : ""}</span>
            <strong style={{ lineHeight: 1.4 }}>{q.label}</strong>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{text ? (q.type === "rating" ? `${text} out of 5` : text) : <span className="c-small">No answer</span>}</p>
            {q.check && <span className="c-small" style={{ color: wrong ? "var(--c-bad)" : "var(--c-ink)" }}>{wrong ? `Wrong: the right answer was “${q.check.answer}”` : "Right answer"}</span>}
          </section>
        );
      })}

      {sp.error && <p className="c-error" role="alert">{sp.error}</p>}

      {s.status === "submitted" ? (
        <>
          <form action={approveResponse.bind(null, id, sub)}>
            <button className="c-btn c-btn-money c-btn-block">Approve and pay {naira(t.reward_kobo)}</button>
          </form>
          <form action={rejectResponse.bind(null, id, sub)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <strong>Don&rsquo;t approve</strong>
            <span className="c-small">No reason, no rejection: the doer sees your reason and has 48 hours to appeal to Doova.</span>
            <ReasonPicker suggestions={suggested} />
            <button className="c-btn c-btn-quiet c-btn-block">Don&rsquo;t approve this response</button>
          </form>
        </>
      ) : (
        <div className="c-card"><p className="c-sub">
          {s.status === "approved" ? "Approved and paid." : s.reject_reason ? `Not approved: “${s.reject_reason}”` : `Status: ${s.status}`}
        </p></div>
      )}
    </>
  );
}
