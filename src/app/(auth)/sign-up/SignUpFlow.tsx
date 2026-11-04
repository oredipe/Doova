"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, normaliseNigerianPhone } from "@/lib/phone";
import { friendlyAuthError } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { completeProfile, type ProfileFormState } from "../actions";

type Step = "phone" | "code" | "profile";
type Mode = "earn" | "create";

const ROLES: { mode: Mode; title: string; text: string }[] = [
  { mode: "earn", title: "I want to earn", text: "Do tasks on my phone and get paid" },
  { mode: "create", title: "I want to post tasks", text: "Get answers from real people" },
];

export function SignUpFlow({ startAt }: { startAt: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAt);
  const [mode, setMode] = useState<Mode>("earn");
  const [phoneText, setPhoneText] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [profileState, profileAction, saving] = useActionState<ProfileFormState, FormData>(completeProfile, {});

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const p = normaliseNigerianPhone(phoneText);
    if (!p) { setError("Enter a Nigerian mobile number, like 0803 123 4567."); return; }
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({
      phone: p,
      options: { shouldCreateUser: true, data: { app_mode: mode } },
    });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    setPhone(p);
    setCode("");
    setResendIn(45);
    setStep("code");
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || code.length !== 6) { setError("Enter the 6 digits from the text."); return; }
    setError(null);
    setBusy(true);
    const { data, error } = await createClient().auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    if (data.user?.user_metadata?.profile_complete) { router.replace("/tasks"); return; }
    setStep("profile");
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 22 }} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="c-title">Create your Doova account</h1>
          <p className="c-sub">Free, and it takes about 2 minutes.</p>
        </div>
        <div role="radiogroup" aria-label="What brings you here" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ROLES.map((r) => (
            <button key={r.mode} type="button" role="radio" className="c-radio" aria-checked={mode === r.mode} onClick={() => setMode(r.mode)}>
              <span className="c-radio-dot" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 650 }}>{r.title}</span>
                <span className="c-small">{r.text}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="c-field">
          <label className="c-label" htmlFor="su-phone">Phone number</label>
          <div className="c-prefix">
            <span aria-hidden="true">+234</span>
            <input id="su-phone" className="c-input" inputMode="tel" autoComplete="tel-national" placeholder="803 000 0000"
              value={phoneText} onChange={(e) => setPhoneText(e.target.value)} aria-invalid={!!error || undefined}
              aria-describedby={error ? "su-err" : undefined} />
          </div>
        </div>
        {error && <p id="su-err" className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
        <p className="c-small" style={{ margin: 0 }}>
          You can do both later: one account, switch any time in Settings. By continuing you agree to our{" "}
          <Link href="/legal/terms">terms</Link> and <Link href="/legal/privacy">privacy policy</Link>.
        </p>
        <p className="c-small" style={{ margin: 0, color: "var(--c-ink)" }}>
          Already have an account? <Link href="/sign-in" style={{ fontWeight: 650 }}>Sign in</Link>
        </p>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={checkCode} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="c-title">Enter the code</h1>
          <p className="c-sub">We sent 6 digits by text to {phone ? maskPhone(phone) : "your phone"}.</p>
        </div>
        <CodeInput value={code} onChange={setCode} invalid={!!error} />
        {error && <p className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          {resendIn > 0
            ? <span className="c-small">Didn&rsquo;t get it? Resend in 0:{String(resendIn).padStart(2, "0")}</span>
            : <button type="button" className="c-link" onClick={() => sendCode()}>Send a new code</button>}
          <button type="button" className="c-link" onClick={() => { setStep("phone"); setError(null); }}>Change number</button>
        </div>
      </form>
    );
  }

  const fieldError = (f: "name" | "password") => profileState.field === f ? profileState.error : undefined;
  return (
    <form action={profileAction} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <input type="hidden" name="mode" value={mode} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-title">Almost done</h1>
        <p className="c-sub">Your phone number is checked. Tell us your name and choose a password.</p>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="su-name">Your name</label>
        <input id="su-name" name="name" className="c-input" autoComplete="name" placeholder="As it is on your NIN"
          aria-invalid={!!fieldError("name") || undefined} />
        <span className="c-small">Use the name on your NIN. Your bank account name must match it when you withdraw.</span>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="su-pass">Create a password</label>
        <input id="su-pass" name="password" type="password" className="c-input" autoComplete="new-password"
          placeholder="At least 8 characters" aria-invalid={!!fieldError("password") || undefined} />
      </div>
      {profileState.error && <p className="c-error" role="alert">{profileState.error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={saving}>
        {saving ? "Creating your account…" : mode === "earn" ? "Start earning" : "Start posting"}
      </button>
    </form>
  );
}
