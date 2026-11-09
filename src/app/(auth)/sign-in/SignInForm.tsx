"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, normaliseNigerianPhone } from "@/lib/phone";
import { friendlyAuthError } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { Icon } from "@/components/Icon";

type Mode = "password" | "code-ask" | "code-enter";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [phoneText, setPhoneText] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(profileComplete: boolean) {
    router.replace(profileComplete ? next : "/sign-up?step=profile");
    router.refresh();
  }

  function readPhone(): string | null {
    const p = normaliseNigerianPhone(phoneText);
    if (!p) setError("Enter a Nigerian mobile number, like 0803 123 4567.");
    return p;
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = readPhone();
    if (!p) return;
    if (!password) { setError("Enter your password."); return; }
    setBusy(true);
    const { data, error } = await createClient().auth.signInWithPassword({ phone: p, password });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    go(!!data.user?.user_metadata?.profile_complete);
  }

  async function askCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = readPhone();
    if (!p) return;
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ phone: p, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    setPhone(p);
    setMode("code-enter");
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || code.length !== 6) { setError("Enter the 6 digits from the text."); return; }
    setError(null);
    setBusy(true);
    const { data, error } = await createClient().auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    go(!!data.user?.user_metadata?.profile_complete);
  }

  const phoneField = (
    <div className="c-field">
      <label className="c-label" htmlFor="si-phone">Phone number</label>
      <div className="c-prefix">
        <span aria-hidden="true">+234</span>
        <input id="si-phone" className="c-input" inputMode="tel" autoComplete="tel-national" placeholder="803 000 0000"
          value={phoneText} onChange={(e) => setPhoneText(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-title">{mode === "code-enter" ? "Enter the code" : "Welcome back"}</h1>
        <p className="c-sub">
          {mode === "code-enter" && phone ? `We sent 6 digits by text to ${maskPhone(phone)}.` : "Sign in to earn or post tasks."}
        </p>
      </div>

      {mode === "password" && (
        <form onSubmit={withPassword} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
          {phoneField}
          <div className="c-field">
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <label className="c-label" htmlFor="si-pass">Password</label>
              <Link href="/forgot-password" className="c-small" style={{ color: "var(--c-ink)", fontWeight: 600 }}>Forgot password?</Link>
            </span>
            <input id="si-pass" type="password" className="c-input" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="c-error" role="alert">{error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <button type="button" className="c-link" onClick={() => { setMode("code-ask"); setError(null); }}>Sign in with a text code instead</button>
          </div>
        </form>
      )}

      {mode === "code-ask" && (
        <form onSubmit={askCode} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
          {phoneField}
          {error && <p className="c-error" role="alert">{error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
          <button type="button" className="c-link" onClick={() => { setMode("password"); setError(null); }}>Use my password</button>
        </form>
      )}

      {mode === "code-enter" && (
        <form onSubmit={checkCode} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <CodeInput value={code} onChange={setCode} invalid={!!error} />
          {error && <p className="c-error" role="alert">{error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="c-link" onClick={() => { setMode("code-ask"); setCode(""); setError(null); }}>Change number</button>
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
