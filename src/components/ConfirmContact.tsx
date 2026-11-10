"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, normaliseNigerianPhone } from "@/lib/phone";
import { isEmail, maskEmail } from "@/lib/contact";
import { friendlyAuthError } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { syncSignInDetails } from "@/app/contactActions";

/**
 * Add a phone number (text code) or an email (email code) to the signed-in account.
 * Supabase sends the code and only switches the account over once the code is right.
 */
export function ConfirmContact({ kind, suggested, buttonLabel }: { kind: "phone" | "email"; suggested?: string; buttonLabel?: string }) {
  const router = useRouter();
  const [text, setText] = useState(kind === "email" ? suggested ?? "" : "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `cc-${kind}`;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const value = sentTo ?? (kind === "phone" ? normaliseNigerianPhone(text) : isEmail(text) ? text.trim().toLowerCase() : null);
    if (!value) { setError(kind === "phone" ? "Enter a Nigerian mobile number, like 0803 123 4567." : "Enter your email, like ada@gmail.com."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser(kind === "phone" ? { phone: value } : { email: value });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message, kind)); return; }
    setSentTo(value);
    setCode("");
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo || code.length !== 6) { setError(`Enter the 6 digits from the ${kind === "email" ? "email" : "text"}.`); return; }
    setError(null);
    setBusy(true);
    const { error } = kind === "phone"
      ? await createClient().auth.verifyOtp({ phone: sentTo, token: code, type: "phone_change" })
      : await createClient().auth.verifyOtp({ email: sentTo, token: code, type: "email_change" });
    if (error) { setBusy(false); setError(friendlyAuthError(error.message, kind)); return; }
    const r = await syncSignInDetails();
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    router.refresh();
  }

  if (!sentTo) {
    return (
      <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 10 }} noValidate>
        <label className="c-label" htmlFor={id}>{kind === "phone" ? "Your phone number" : "Your email"}</label>
        {kind === "phone" ? (
          <div className="c-prefix">
            <span aria-hidden="true">+234</span>
            <input id={id} className="c-input" inputMode="tel" autoComplete="tel-national" placeholder="803 000 0000"
              value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!error || undefined} />
          </div>
        ) : (
          <input id={id} className="c-input" type="email" inputMode="email" autoComplete="email" placeholder="ada@gmail.com"
            value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!error || undefined} />
        )}
        {error && <p className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary" disabled={busy}>{busy ? "Sending…" : buttonLabel ?? "Send me a code"}</button>
      </form>
    );
  }
  return (
    <form onSubmit={check} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="c-small" style={{ color: "var(--c-ink)" }}>
        {kind === "email" ? `We emailed 6 digits to ${maskEmail(sentTo)}. Check Spam and Promotions if it isn’t there.` : `We sent 6 digits by text to ${maskPhone(sentTo)}.`}
      </span>
      <CodeInput value={code} onChange={setCode} invalid={!!error} />
      {error && <p className="c-error" role="alert">{error}</p>}
      <button className="c-btn c-btn-primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Confirm"}</button>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <button type="button" className="c-link" onClick={() => send()}>Send a new code</button>
        <button type="button" className="c-link" onClick={() => { setSentTo(null); setError(null); }}>{kind === "email" ? "Change email" : "Change number"}</button>
      </div>
    </form>
  );
}
