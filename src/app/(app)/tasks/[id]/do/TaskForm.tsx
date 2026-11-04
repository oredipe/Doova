"use client";
import { useActionState, useEffect, useState } from "react";
import type { Question } from "@/lib/tasks";
import { submitAnswers, type SubmitState } from "../actions";

type PublicQuestion = Omit<Question, "check">;

function Countdown({ until }: { until: string }) {
  const end = new Date(until).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 1000);
    return () => clearInterval(t);
  }, [end]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const low = left < 3 * 60000;
  return (
    <span className="c-pill" role="timer" aria-live="off"
      style={{ background: low ? "var(--c-bad-soft)" : "var(--c-violet-soft)", color: low ? "var(--c-bad)" : "var(--c-violet-text)", height: 30, fontSize: 13 }}>
      {left === 0 ? "Time's up" : `${m}:${String(s).padStart(2, "0")} left`}
    </span>
  );
}

function QuestionField({ q, n, error }: { q: PublicQuestion; n: number; error?: string }) {
  const [text, setText] = useState("");
  const legend = <legend style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, padding: 0, marginBottom: 12 }}>{n}. {q.label}</legend>;
  const box: React.CSSProperties = { border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 };
  const choice: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", minHeight: 52, padding: "0 16px", borderRadius: 12, background: "var(--c-surface)", border: "1px solid var(--c-line)", cursor: "pointer", fontSize: 15 };

  let body: React.ReactNode = null;
  if (q.type === "single_choice" || q.type === "multi_choice") {
    const type = q.type === "single_choice" ? "radio" : "checkbox";
    body = (q.options ?? []).map((o) => (
      <label key={o} style={choice} className="c-choice">
        <input type={type} name={q.id} value={o} style={{ width: 20, height: 20, accentColor: "#111" }} />
        {o}
      </label>
    ));
  } else if (q.type === "rating") {
    const scale = q.scale ?? 5;
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${scale}, 1fr)`, gap: 8 }}>
          {Array.from({ length: scale }, (_, i) => (
            <label key={i} className="c-rate">
              <input type="radio" name={q.id} value={i + 1} className="sr-only" />
              <span>{i + 1}</span>
            </label>
          ))}
        </div>
        {(q.low || q.high) && (
          <div style={{ display: "flex", justifyContent: "space-between" }} className="c-small">
            <span>1 = {q.low ?? "Poor"}</span><span>{scale} = {q.high ?? "Great"}</span>
          </div>
        )}
      </>
    );
  } else if (q.type === "short_text") {
    body = <input name={q.id} className="c-input" maxLength={200} aria-invalid={!!error || undefined} />;
  } else {
    body = (
      <>
        <textarea name={q.id} className="c-input" rows={5} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
          style={{ padding: 14, minHeight: 130, resize: "vertical", lineHeight: 1.5 }} aria-invalid={!!error || undefined} />
        {q.min_length && (
          <span className="c-small">{text.trim().length < q.min_length ? `At least ${q.min_length} characters (${text.trim().length} so far)` : "Thanks, that's enough detail"}</span>
        )}
      </>
    );
  }
  return (
    <fieldset style={box} aria-invalid={!!error || undefined}>
      {legend}
      {body}
      {error && <p className="c-error" role="alert">{error}</p>}
    </fieldset>
  );
}

export function TaskForm({ taskId, questions, until }: { taskId: string; questions: PublicQuestion[]; until: string }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitAnswers.bind(null, taskId), {});
  // After a failed submit, bring the first question that needs attention into view.
  useEffect(() => {
    if (!state.errors) return;
    const first = document.querySelector('fieldset[aria-invalid="true"]');
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    (first?.querySelector("input, textarea") as HTMLElement | null)?.focus({ preventScroll: true });
  }, [state]);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 28 }} noValidate>
      <div style={{ position: "sticky", top: 72, zIndex: 5, display: "flex", justifyContent: "flex-end" }}>
        <Countdown until={until} />
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="c-card"><QuestionField q={q} n={i + 1} error={state.errors?.[q.id]} /></div>
      ))}
      {state.message && <p className="c-error" role="alert">{state.message}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={pending}>{pending ? "Sending…" : "Submit answers"}</button>
    </form>
  );
}
