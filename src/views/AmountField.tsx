"use client";
import { useState } from "react";

const n = (k: number) => "₦" + Math.round(k / 100).toLocaleString("en-NG");

/** Amount to withdraw, with the ₦100 fee and stamp duty worked out as you type. */
export function AmountField({ maxKobo, feeKobo, dutyFromKobo, dutyKobo }: { maxKobo: number; feeKobo: number; dutyFromKobo: number; dutyKobo: number }) {
  const [text, setText] = useState(String(Math.floor(maxKobo / 100)));
  const kobo = Math.round(Number(text.replace(/[^\d.]/g, "")) * 100) || 0;
  const duty = kobo >= dutyFromKobo ? dutyKobo : 0;
  const receive = Math.max(0, kobo - feeKobo - duty);
  return (
    <>
      <label className="c-field">
        <span className="c-label">Amount</span>
        <div className="c-prefix">
          <span aria-hidden="true">₦</span>
          <input name="amount" className="c-input" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} aria-describedby="wd-sum" />
        </div>
      </label>
      <button type="button" className="c-link" style={{ alignSelf: "flex-start" }} onClick={() => setText(String(Math.floor(maxKobo / 100)))}>Withdraw everything ({n(maxKobo)})</button>
      <div id="wd-sum" className="c-card" style={{ background: "var(--c-ground)", display: "flex", flexDirection: "column", gap: 6 }} aria-live="polite">
        <span style={{ display: "flex", justifyContent: "space-between" }}><span className="c-sub">Doova fee</span><span>{n(feeKobo)}</span></span>
        {duty > 0 && <span style={{ display: "flex", justifyContent: "space-between" }}><span className="c-sub">Stamp duty (government)</span><span>{n(duty)}</span></span>}
        <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>You&rsquo;ll receive</span><span>{n(receive)}</span></span>
      </div>
      <button className="c-btn c-btn-money c-btn-block" disabled={kobo < 150000 || kobo > maxKobo}>
        {kobo > maxKobo ? "More than you have" : kobo < 150000 ? "The smallest withdrawal is ₦1,500" : `Withdraw ${n(kobo)}`}
      </button>
    </>
  );
}
