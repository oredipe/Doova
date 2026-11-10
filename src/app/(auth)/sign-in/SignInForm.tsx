"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone } from "@/lib/phone";
import { maskEmail, readContact, type Contact } from "@/lib/contact";
import { friendlyAuthError, smsFailed, TEXTS_PAUSED } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { Icon } from "@/components/Icon";

type Mode = "password" | "code-ask" | "code-enter";

/** Sign in with a phone number or email: password, or a one-time code (by text or by email). */
export function SignInForm({ next, smsOn }: { next: string; smsOn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [idText, setIdText] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<Contact | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(profileComplete: boolean) {
    router.replace(profileComplete ? next : "/sign-up?step=profile");
    router.refresh();
  }

  function readId(): Contact | null {
    const c = readContact(idText);
    if (!c) setError(idText.includes("@") ? "That email doesn’t look right. Check it and try again." : "Enter your phone number, like 0803 123 4567, or your email.");
    return c;
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const c = readId();
    if (!c) return;
    if (!password) { setError("Enter your password."); return; }
    setBusy(true);
    const { data, error } = c.kind === "phone"
      ? await createClient().auth.signInWithPassword({ phone: c.value, password })
      : await createClient().auth.signInWithPassword({ email: c.value, password });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message, c.kind)); return; }
    go(!!data.user?.user_metadata?.profile_complete);
  }

  async function askCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const c = readId();
    if (!c) return;
    setBusy(true);
    const { error } = c.kind === "phone"
      ? await createClient().auth.signInWithOtp({ phone: c.value, options: { shouldCreateUser: false } })
      : await createClient().auth.signInWithOtp({ email: c.value, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setError(c.kind === "phone" && !smsOn && smsFailed(error.message) ? TEXTS_PAUSED : friendlyAuthError(error.message, c.kind)); return; }
    setSentTo(c);
    setCode("");
    setMode("code-enter");
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo || code.length !== 6) { setError(`Enter the 6 digits from the ${sentTo?.kind === "email" ? "email" : "text"}.`); return; }
    setError(null);
    setBusy(true);
    const { data, error } = sentTo.kind === "phone"
      ? await createClient().auth.verifyOtp({ phone: sentTo.value, token: code, type: "sms" })
      : await createClient().auth.verifyOtp({ email: sentTo.value, token: code, type: "email" });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message, sentTo.kind)); return; }
    go(!!data.user?.user_metadata?.profile_complete);
  }

  const idField = (
    <div className="c-field">
      <label className="c-label" htmlFor="si-phone">Phone number or email</label>
      <input id="si-phone" className="c-input" autoComplete="username" autoCapitalize="none" spellCheck={false}
        placeholder="0803 000 0000 or ada@gmail.com" value={idText} onChange={(e) => setIdText(e.target.value)} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-title">{mode === "code-enter" ? "Enter the code" : "Welcome back"}</h1>
        <p className="c-sub">
          {mode === "code-enter" && sentTo
            ? sentTo.kind === "email" ? `We emailed 6 digits to ${maskEmail(sentTo.value)}.` : `We sent 6 digits by text to ${maskPhone(sentTo.value)}.`
            : "Sign in to earn or post tasks."}
        </p>
      </div>

      {mode === "password" && (
        <form onSubmit={withPassword} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
          {idField}
          <div className="c-field">
            <label className="c-label" htmlFor="si-pass">Password</label>
            <input id="si-pass" type="password" className="c-input" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="c-error" role="alert">{error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <button type="button" className="c-link" onClick={() => { setMode("code-ask"); setError(null); }}>Sign in with a code instead</button>
            <Link href="/forgot-password" className="c-link" style={{ whiteSpace: "nowrap" }}>Forgot password?</Link>
          </div>
        </form>
      )}

      {mode === "code-ask" && (
        <form onSubmit={askCode} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
          {idField}
          <span className="c-small" style={{ marginTop: -8 }}>
            {smsOn ? "We’ll text the code to your phone, or email it if you enter your email." : "Enter the email on your account and we’ll email you a code."}
          </span>
          {error && <p className="c-error" role="alert">{error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
          <button type="button" className="c-link" onClick={() => { setMode("password"); setError(null); }}>Use my password</button>
        </form>
      )}

      {mode === "code-enter" && (
        <form onSubmit={checkCode} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <CodeInput value={code} onChange={setCode} invalid={!!error} />
          {sentTo?.kind === "email" && <p className="c-small" style={{ margin: 0 }}>Not there after a minute? Check Spam and Promotions.</p>}
          {error && <p className="c-error" role="alert">{error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="c-link" onClick={() => { setMode("code-ask"); setCode(""); setError(null); }}>
            {sentTo?.kind === "email" ? "Change email" : "Change number"}
          </button>
        </form>
      )}

      <div className="c-card" style={{ display: "flex", gap: 14, alignItems: "center", padding: 18 }}>
        <span className="c-ico"><Icon name="laptop" size={18} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 650 }}>On a laptop or shared computer?</span>
          <span className="c-small">Sign in by scanning a code with your phone. Coming soon.</span>
        </span>
      </div>
      <p className="c-small" style={{ margin: 0, color: "var(--c-ink)" }}>
        New to Doova? <Link href="/sign-up" style={{ fontWeight: 650 }}>Create an account</Link>
      </p>
    </div>
  );
}
