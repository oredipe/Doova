"use client";
import { useState } from "react";
import { maskPhone } from "@/lib/phone";
import { Icon } from "./Icon";

export type CodeBackupsOn = { whatsapp: boolean; voice: boolean };

/**
 * Under a phone-code box, once "Resend" is allowed: get the code on WhatsApp or by a voice call instead.
 * Some networks (Airtel) don't deliver codes from shared Sender IDs. Records the choice, then asks for a new
 * code with `resend`, which the SMS hook sends by that route.
 */
export function CodeBackups({ phone, on, resend, onSent }: {
  phone: string; on: CodeBackupsOn;
  resend: () => Promise<{ error: { message: string } | null }>;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState<null | "whatsapp" | "voice">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!on.whatsapp && !on.voice) return null;

  async function go(channel: "whatsapp" | "voice") {
    setBusy(channel); setError(null); setNote(null);
    const res = await fetch("/api/auth/code-channel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, channel }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setBusy(null); setError(j.error ?? "That didn’t work. Please try again."); return; }
    const { error: e } = await resend();
    setBusy(null);
    if (e) { setError(/after|seconds|rate/i.test(e.message) ? "Please wait a minute, then try again." : "We couldn’t send a new code. Please try again."); return; }
    setNote(channel === "whatsapp"
      ? `We’ve sent the code on WhatsApp to ${maskPhone(phone)}. It comes from Termii, our messaging partner.`
      : `We’re calling ${maskPhone(phone)} now. Answer, and a voice will read out your 6 digits.`);
    onSent();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="c-small">No text after a minute? Get the code on:</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {on.whatsapp && <button type="button" className="c-btn c-btn-quiet" style={{ minHeight: 44, flex: "1 1 130px", gap: 8, whiteSpace: "nowrap" }} disabled={!!busy} onClick={() => go("whatsapp")}><Icon name="chat" size={18} />{busy === "whatsapp" ? "Sending…" : "WhatsApp"}</button>}
        {on.voice && <button type="button" className="c-btn c-btn-quiet" style={{ minHeight: 44, flex: "1 1 130px", gap: 8, whiteSpace: "nowrap" }} disabled={!!busy} onClick={() => go("voice")}><Icon name="phone" size={18} />{busy === "voice" ? "Calling…" : "Call me"}</button>}
      </div>
      {note && <p className="c-small" role="status" style={{ margin: 0, color: "var(--c-ink)" }}>{note}</p>}
      {error && <p className="c-error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
