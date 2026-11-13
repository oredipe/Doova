"use client";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, normaliseNigerianPhone } from "@/lib/phone";
import { isEmail, maskEmail } from "@/lib/contact";
import { friendlyAuthError } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { PasswordInput } from "@/components/PasswordInput";
import { CodeBackups, type CodeBackupsOn } from "@/components/CodeBackups";
import { completeProfile, type ProfileFormState } from "../actions";
import { MONTHS } from "@/lib/details";

type Step = "start" | "code" | "profile";
type Mode = "earn" | "create";
type Via = "phone" | "email";

const ROLES: { mode: Mode; title: string; text: string }[] = [
  { mode: "earn", title: "I want to earn", text: "Do tasks on my phone and get paid" },
  { mode: "create", title: "I want to post tasks", text: "Get answers from real people" },
];

/**
 * Sign-up: choose earn or post → a code → name and password.
 * Doers always sign up with a phone number (one SIM, one doer: it keeps fake accounts off tasks).
 * Creators sign up by email, or by phone if they prefer once text codes are on.
 */
export function SignUpFlow({ startAt, smsOn, startMode = "earn", backups = { whatsapp: false, voice: false } }: { startAt: "start" | "profile"; smsOn: boolean; startMode?: Mode; backups?: CodeBackupsOn }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAt);
  const [mode, setMode] = useState<Mode>(startMode);   // ?as=create from "Post a task" buttons
  const [chosenVia, setChosenVia] = useState<Via | null>(null);
  const via: Via = mode === "earn" ? "phone" : smsOn ? chosenVia ?? "email" : "email";
  const [phoneText, setPhoneText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [sentTo, setSentTo] = useState<{ via: Via; value: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [profileState, profileAction, saving] = useActionState<ProfileFormState, FormData>(completeProfile, {});
  const [agreed, setAgreed] = useState(false);
  // Controlled, so a "too young" or password error doesn't clear what was already chosen.
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState({ d: "", m: "", y: "" });

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
    if (data.user?.user_metadata?.profile_complete) { router.replace(data.user.user_metadata.app_mode === "create" ? "/create" : "/tasks"); return; }
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
        {smsOn && mode === "create" && (
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
            {!smsOn && <span className="c-small">Text codes aren&rsquo;t switched on yet, so sign-ups for earning open soon. Pilot testers can carry on.</span>}
          </div>
        ) : (
          <div className="c-field">
            <label className="c-label" htmlFor="su-email">Email</label>
            <input id="su-email" className="c-input" type="email" inputMode="email" autoComplete="email" placeholder="ada@gmail.com"
              value={emailText} onChange={(e) => setEmailText(e.target.value)} aria-invalid={!!error || undefined}
              aria-describedby={error ? "su-err" : "su-email-hint"} />
            <span id="su-email-hint" className="c-small">
We&rsquo;ll email you a 6-digit code. To do tasks yourself later, you&rsquo;ll add a phone number.
            </span>
          </div>
        )}
        {error && <p id="su-err" className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
        <p className="c-small" style={{ margin: 0 }}>
          You can do both later: one account, switch any time in Settings.
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
        {!byEmail && sentTo && resendIn === 0 && (
          <CodeBackups phone={sentTo.value} on={backups} onSent={() => setResendIn(60)}
            resend={() => createClient().auth.signInWithOtp({ phone: sentTo.value, options: { shouldCreateUser: true, data: { app_mode: mode } } })} />
        )}
      </form>
    );
  }

  const fieldError = (f: NonNullable<ProfileFormState["field"]>) => profileState.field === f ? profileState.error : undefined;
  const thisYear = new Date().getFullYear();
  return (
    // Submitted by hand (not form action=) so React doesn't reset the fields when the server says "not yet".
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => profileAction(fd)); }}
      style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <input type="hidden" name="mode" value={mode} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-title">Almost done</h1>
        <p className="c-sub">Your {sentTo?.via === "email" ? "email" : sentTo ? "phone number" : "sign-up"} is checked. Tell us your name{mode === "earn" ? ", your date of birth" : ""} and choose a password.</p>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="su-name">Your name</label>
        <input id="su-name" name="name" className="c-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="As it is on your NIN"
          aria-invalid={!!fieldError("name") || undefined} />
        <span className="c-small">Use the name on your NIN. Your bank account name must match it when you withdraw.</span>
      </div>
      {mode === "earn" && (
        <fieldset className="c-field" style={{ border: 0, margin: 0, padding: 0 }} aria-describedby="su-dob-hint">
          <legend className="c-label" style={{ padding: 0, marginBottom: 8 }}>Date of birth</legend>
          <div className="pf-dob">
            <select name="dob_d" value={dob.d} onChange={(e) => setDob({ ...dob, d: e.target.value })} className="c-input" aria-label="Day" aria-invalid={!!fieldError("dob") || undefined}>
              <option value="" disabled>Day</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
            <select name="dob_m" value={dob.m} onChange={(e) => setDob({ ...dob, m: e.target.value })} className="c-input" aria-label="Month" aria-invalid={!!fieldError("dob") || undefined}>
              <option value="" disabled>Month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select name="dob_y" value={dob.y} onChange={(e) => setDob({ ...dob, y: e.target.value })} className="c-input" aria-label="Year" aria-invalid={!!fieldError("dob") || undefined}>
              <option value="" disabled>Year</option>{Array.from({ length: 90 }, (_, i) => thisYear - 16 - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span id="su-dob-hint" className="c-small">You must be 18 or older. We check it against your NIN before your first withdrawal.</span>
        </fieldset>
      )}
      <div className="c-field">
        <label className="c-label" htmlFor="su-pass">Create a password</label>
        <PasswordInput id="su-pass" name="password" autoComplete="new-password"
          placeholder="At least 8 characters" aria-invalid={!!fieldError("password") || undefined} />
      </div>
      <label className="pf-tick">
        <input type="checkbox" name="agree" value="yes" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-invalid={!!fieldError("agree") || undefined} />
        <span>I confirm I am <b>18 or older</b>, and I agree to Doova&rsquo;s <Link href="/legal/terms" target="_blank">Terms</Link> and <Link href="/legal/privacy" target="_blank">Privacy policy</Link>.</span>
      </label>
      {profileState.error && <p className="c-error" role="alert">{profileState.error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={saving || !agreed}>
        {saving ? "Creating your account…" : mode === "earn" ? "Start earning" : "Start posting"}
      </button>
    </form>
  );
}
