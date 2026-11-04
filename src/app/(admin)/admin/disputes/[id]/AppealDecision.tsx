"use client";
import { useState } from "react";

export function AppealDecision({ action, reward, doer }: { action: (f: FormData) => void; reward: string; doer: string }) {
  const [choice, setChoice] = useState<"creator" | "doer" | null>(null);
  const first = doer.split(" ")[0];
  const opts = [
    { v: "creator" as const, t: "Keep the rejection", s: `The ${reward} stays with the task and the slot reopens` },
    { v: "doer" as const, t: `Overturn and pay ${first} ${reward}`, s: "Paid from the money locked in this task" },
  ];
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="decision" value={choice ?? ""} />
      <div role="radiogroup" aria-label="Your decision" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={choice === o.v} className="c-radio" style={{ background: "#F6F6F1" }} onClick={() => setChoice(o.v)}>
            <span className="c-radio-dot" />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong>{o.t}</strong><span className="c-small">{o.s}</span></span>
          </button>
        ))}
      </div>
      <label className="c-field">
        <span className="c-label">Reason (both sides see this)</span>
        <textarea name="note" className="c-input" rows={5} required minLength={10} maxLength={800} style={{ padding: 14, lineHeight: 1.5 }} />
      </label>
      <button className="c-btn c-btn-primary c-btn-block" disabled={!choice}>
        {choice === "doer" ? `Overturn and pay ${reward}` : choice === "creator" ? "Keep the rejection" : "Choose a decision"}
      </button>
    </form>
  );
}
