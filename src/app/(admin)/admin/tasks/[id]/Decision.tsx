"use client";
import { useState } from "react";

/** Approve, or turn down with a note the creator sees (all money back, fee included). */
export function Decision({ action, refund, creator, reasons, flagged }: {
  action: (f: FormData) => void; refund: string; creator: string; reasons: string[]; flagged: boolean;
}) {
  const [choice, setChoice] = useState<"approve" | "reject">(flagged ? "reject" : "approve");
  const [note, setNote] = useState("");
  const opts = [
    { v: "approve" as const, t: "Approve and go live", s: "Doers see it straight away" },
    { v: "reject" as const, t: "Turn down and refund", s: `${refund} goes back to their Creator funds, fee included` },
  ];
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="decision" value={choice} />
      <div role="radiogroup" aria-label="Your decision" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={choice === o.v} className="c-radio" style={{ background: "#F6F6F1" }} onClick={() => setChoice(o.v)}>
            <span className="c-radio-dot" />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong>{o.t}</strong><span className="c-small">{o.s}</span></span>
          </button>
        ))}
      </div>
      {choice === "reject" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {reasons.map((r) => (
            <button key={r} type="button" className="c-chip" aria-pressed={note === r} onClick={() => setNote(r)} style={{ minHeight: 36 }}>{r}</button>
          ))}
        </div>
      )}
      <label className="c-field">
        <span className="c-label">Note to {creator} {choice === "reject" ? "(they see this)" : "(optional, they see it)"}</span>
        <textarea name="note" className="c-input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
          style={{ padding: 14, lineHeight: 1.5 }} required={choice === "reject"} minLength={choice === "reject" ? 5 : undefined}
          placeholder={choice === "reject" ? "Say what to change so they can post it again" : ""} />
      </label>
      <button className="c-btn c-btn-primary c-btn-block">{choice === "approve" ? "Approve and go live" : `Turn down and refund ${refund}`}</button>
    </form>
  );
}
