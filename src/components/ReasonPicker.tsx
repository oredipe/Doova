"use client";
import { useState } from "react";

/** Reason for not approving: tap a suggestion or write your own (shown to the doer). */
export function ReasonPicker({ suggestions }: { suggestions: string[] }) {
  const [reason, setReason] = useState("");
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {suggestions.map((s) => (
          <button key={s} type="button" className="c-chip" aria-pressed={reason === s} onClick={() => setReason(s)} style={{ textAlign: "left", height: "auto", padding: "9px 14px", whiteSpace: "normal", maxWidth: "100%", flex: "0 1 auto", lineHeight: 1.35 }}>{s}</button>
        ))}
      </div>
      <label className="c-field">
        <span className="c-label">Reason</span>
        <textarea name="reason" className="c-input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
          style={{ padding: 14, lineHeight: 1.5 }} placeholder="Be specific, e.g. which question and why" required minLength={10} />
      </label>
    </>
  );
}
