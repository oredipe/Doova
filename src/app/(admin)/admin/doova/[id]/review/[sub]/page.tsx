import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ReasonPicker } from "@/components/ReasonPicker";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { FLAG } from "@/lib/creator";
import { loadDoovaTask } from "@/lib/doova";
import type { Answers } from "@/lib/tasks";
import { Top } from "../../../../Top";
import { approveDoovaResponse, rejectDoovaResponse } from "../../../actions";

export const metadata: Metadata = { title: "Review a response" };

export default async function DoovaReview({ params, searchParams }: {
  params: Promise<{ id: string; sub: string }>; searchParams: Promise<{ error?: string; after?: string }>;
}) {
  const [{ id, sub }, sp] = await Promise.all([params, searchParams]);
  await requireStaff("task.moderate");
  const now = nowMs();
  const t = await loadDoovaTask(id);
  const db = createAdminClient();

  if (sub === "next") {
    const { data } = await db.from("submissions").select("id").eq("task_id", id).eq("status", "submitted")
      .neq("id", sp.after ?? "00000000-0000-0000-0000-000000000000").order("submitted_at", { ascending: true }).limit(1);
    if (data?.[0]) redirect(`/admin/doova/${id}/review/${data[0].id}`);
    redirect(`/admin/doova/${id}?tab=review&reviewed=1`);
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
      <Top title={doer?.full_name ?? "Doer"} sub={`Level ${doer?.level ?? 1}${checks.seconds ? ` · took ${Math.max(1, Math.round(checks.seconds / 60))} min (estimate ${t.estimated_minutes})` : ""}`}
        back={{ href: `/admin/doova/${id}?tab=review`, label: t.title }} />
      <div className="ops-body" style={{ maxWidth: 720 }}>
        {failed.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{failed.map((f) => <span key={f} className="c-pill c-pill-bad">{FLAG[f] ?? f}</span>)}</div>}
        {s.status === "submitted" && <div className="c-note"><Icon name="clock" size={18} /><span>If no one decides in {hoursLeft} hours, this response is approved automatically.</span></div>}

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
            <form action={approveDoovaResponse.bind(null, id, sub)}>
              <button className="c-btn c-btn-money c-btn-block">{t.reward_kobo === 0 ? "Approve (earns XP)" : `Approve and pay ${naira(t.reward_kobo)}`}</button>
            </form>
            <form action={rejectDoovaResponse.bind(null, id, sub)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <strong>Don&rsquo;t approve</strong>
              <span className="c-small">The doer sees your reason and has 48 hours to appeal. Another staff member decides appeals.</span>
              <ReasonPicker suggestions={suggested} />
              <button className="c-btn c-btn-quiet c-btn-block">Don&rsquo;t approve this response</button>
            </form>
          </>
        ) : (
          <div className="c-card"><p className="c-sub">
            {s.status === "approved" ? (t.reward_kobo === 0 ? "Approved." : "Approved and paid.") : s.reject_reason ? `Not approved: “${s.reject_reason}”` : `Status: ${s.status}`}
          </p></div>
        )}
      </div>
    </>
  );
}
