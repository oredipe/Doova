"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, normaliseNigerianPhone } from "@/lib/phone";
import { friendlyAuthError } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";

// Forgot password: prove it's your phone with a text code, then choose a new password.
// The code signs you in; the new password replaces the old one.
type Step = "phone" | "code" | "password";

export function ResetFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phoneText, setPhoneText] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const p = phone && step === "code" ? phone : normaliseNigerianPhone(phoneText);
    if (!p) { setError("Enter a Nigerian mobile number, like 0803 123 4567."); return; }
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({ phone: p, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    setPhone(p); setCode(""); setResendIn(45); setStep("code");
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || code.length !== 6) { setError("Enter the 6 digits from the text."); return; }
    setError(null); setBusy(true);
    const { data, error } = await createClient().auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    if (!data.user?.user_metadata?.profile_complete) { router.replace("/sign-up?step=profile"); return; }  // never finished sign-up
    setStep("password");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pass.length < 8) { setError("Use at least 8 characters."); return; }
    if (pass !== again) { setError("The two passwords don’t match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pass });
    setBusy(false);
    if (error) {
      setError(/same|different/i.test(error.message) ? "That’s your current password. Choose a new one, or just carry on to Doova." : friendlyAuthError(error.message));
      return;
    }
    router.replace("/tasks?reset=1");
    router.refresh();
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 22 }} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="c-title">Forgot your password?</h1>
          <p className="c-sub">No problem. Enter the phone number you signed up with and we&rsquo;ll text you a code.</p>
        </div>
        <div className="c-field">
          <label className="c-label" htmlFor="fp-phone">Phone number</label>
          <div className="c-prefix">
            <span aria-hidden="true">+234</span>
            <input id="fp-phone" className="c-input" inputMode="tel" autoComplete="tel-national" placeholder="803 000 0000"
              value={phoneText} onChange={(e) => setPhoneText(e.target.value)} aria-invalid={!!error || undefined} />
          </div>
        </div>
        {error && <p className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
        <p className="c-small" style={{ margin: 0, color: "var(--c-ink)" }}>
          Remembered it? <Link href="/sign-in" style={{ fontWeight: 650 }}>Back to sign in</Link>
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

  return (
    <form onSubmit={savePassword} style={{ display: "flex", flexDirection: "column", gap: 22 }} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-title">Choose a new password</h1>
        <p className="c-sub">Your phone number is checked. Pick a password you haven&rsquo;t used for Doova before.</p>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="fp-pass">New password</label>
        <input id="fp-pass" type="password" className="c-input" autoComplete="new-password" placeholder="At least 8 characters"
          value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="fp-again">Type it again</label>
        <input id="fp-again" type="password" className="c-input" autoComplete="new-password"
          value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      {error && <p className="c-error" role="alert">{error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}
