import { Icon } from "@/components/Icon";
import type { Answers, Question } from "@/lib/tasks";

/** Approved answers summed up per question, with a CSV download. Used by creators and Doova staff. */
export function TaskResults({ questions: qs, answers, exportHref }: { questions: Question[]; answers: (Answers | null)[]; exportHref: string }) {
  if (answers.length === 0) return <div className="c-card"><p className="c-sub">Results appear here as responses are approved.</p></div>;
  return (
    <>
      <a href={exportHref} className="c-btn c-btn-quiet" style={{ alignSelf: "flex-start" }}><Icon name="download" size={18} /> Download all answers (CSV)</a>
      {qs.map((q, i) => {
        const vals = answers.map((a) => a?.[q.id]).filter((v) => v !== undefined && v !== "");
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
