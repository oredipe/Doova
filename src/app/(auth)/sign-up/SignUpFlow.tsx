"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, normaliseNigerianPhone } from "@/lib/phone";
import { isEmail, maskEmail } from "@/lib/contact";
import { friendlyAuthError } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { completeProfile, type ProfileFormState } from "../actions";

type Step = "start" | "code" | "profile";
type Mode = "earn" | "create";
type Via = "phone" | "email";

const ROLES: { mode: Mode; title: string; text: string }[] = [
  { mode: "earn", title: "I want to earn", text: "Do tasks on my phone and get paid" },
  { mode: "create", title: "I want to post tasks", text: "Get answers from real people" },
];

/**
 * Sign-up: choose earn or post → a code by text or email → name and password.
 * With texts on, doers start on phone and creators on email; either can switch. With texts off, email only.
 */
export function SignUpFlow({ startAt, smsOn }: { startAt: "start" | "profile"; smsOn: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAt);
  const [mode, setMode] = useState<Mode>("earn");
  const [chosenVia, setChosenVia] = useState<Via | null>(null);
  const via: Via = !smsOn ? "email" : chosenVia ?? (mode === "earn" ? "phone" : "email");
  const [phoneText, setPhoneText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [sentTo, setSentTo] = useState<{ via: Via; value: string } | null>(null);
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
    const target = step === "code" && sentTo ? sentTo : via === "phone"
      ? (() => { const p = normaliseNigerianPhone(phoneText); return p ? { via: "phone" as const, value: p } : null; })()
      : isEmail(emailText) ? { via: "email" as const, value: emailText.trim().toLowerCase() } : null;
    if (!target) {
      setError(via === "phone" ? "Enter a Nigerian mobile number, like 0803 123 4567." : "Enter your email, like ada@gmail.com.");
      return;
    }
    setBusy(true);
    const options = { shouldCreateUser: true, data: { app_mode: mode } };
    const { error } = target.via === "phone"
      ? await createClient().auth.signInWithOtp({ phone: target.value, options })
      : await createClient().auth.signInWithOtp({ email: target.value, options });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message, target.via)); return; }
    setSentTo(target);
    setCode("");
    setResendIn(45);
    setStep("code");
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo || code.length !== 6) { setError(`Enter the 6 digits from the ${sentTo?.via === "email" ? "email" : "text"}.`); return; }
    setError(null);
    setBusy(true);
    const { data, error } = sentTo.via === "phone"
      ? await createClient().auth.verifyOtp({ phone: sentTo.value, token: code, type: "sms" })
      : await createClient().auth.verifyOtp({ email: sentTo.value, token: code, type: "email" });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message, sentTo.via)); return; }
    if (data.user?.user_metadata?.profile_complete) { router.replace("/tasks"); return; }
    setStep("profile");
  }

  if (step === "start") {
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
        {smsOn && (
          <div className="c-seg" role="radiogroup" aria-label="Get your code by">
            {(["phone", "email"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={via === v} onClick={() => { setChosenVia(v); setError(null); }}>
                {v === "phone" ? "Phone number" : "Email"}
              </button>
            ))}
          </div>
        )}
        {via === "phone" ? (
          <div className="c-field">
            <label className="c-label" htmlFor="su-phone">Phone number</label>
            <div className="c-prefix">
              <span aria-hidden="true">+234</span>
              <input id="su-phone" className="c-input" inputMode="tel" autoComplete="tel-national" placeholder="803 000 0000"
                value={phoneText} onChange={(e) => setPhoneText(e.target.value)} aria-invalid={!!error || undefined}
                aria-describedby={error ? "su-err" : undefined} />
            </div>
          </div>
        ) : (
          <div className="c-field">
            <label className="c-label" htmlFor="su-email">Email</label>
            <input id="su-email" className="c-input" type="email" inputMode="email" autoComplete="email" placeholder="ada@gmail.com"
              value={emailText} onChange={(e) => setEmailText(e.target.value)} aria-invalid={!!error || undefined}
              aria-describedby={error ? "su-err" : "su-email-hint"} />
            <span id="su-email-hint" className="c-small">
              {smsOn || mode === "create" ? "We’ll email you a 6-digit code." : "We’ll email you a 6-digit code. You’ll add your phone number later, before your first withdrawal."}
            </span>
          </div>
        )}
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
    const byEmail = sentTo?.via === "email";
    return (
      <form onSubmit={checkCode} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="c-title">Enter the code</h1>
          <p className="c-sub">
            {byEmail ? `We emailed 6 digits to ${maskEmail(sentTo!.value)}.` : `We sent 6 digits by text to ${sentTo ? maskPhone(sentTo.value) : "your phone"}.`}
          </p>
        </div>
        <CodeInput value={code} onChange={setCode} invalid={!!error} />
        {byEmail && <p className="c-small" style={{ margin: 0 }}>Not there after a minute? Check Spam and Promotions. It comes from Doova.</p>}
        {error && <p className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          {resendIn > 0
            ? <span className="c-small">Didn&rsquo;t get it? Resend in 0:{String(resendIn).padStart(2, "0")}</span>
            : <button type="button" className="c-link" onClick={() => sendCode()}>Send a new code</button>}
          <button type="button" className="c-link" onClick={() => { setStep("start"); setError(null); }}>{byEmail ? "Change email" : "Change number"}</button>
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
        <p className="c-sub">Your {sentTo?.via === "email" ? "email" : sentTo ? "phone number" : "sign-up"} is checked. Tell us your name and choose a password.</p>
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
