"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { maskPhone } from "@/lib/phone";
import { maskEmail, readContact, type Contact } from "@/lib/contact";
import { friendlyAuthError, smsFailed } from "@/lib/auth-errors";
import { CodeInput } from "@/components/CodeInput";
import { PasswordInput } from "@/components/PasswordInput";

// Forgot password: prove it's your phone (text code) or your email (email code), then choose a new password.
// The code signs you in; the new password replaces the old one.
type Step = "phone" | "code" | "authenticator" | "password";

export function ResetFlow({ smsOn }: { smsOn: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [idText, setIdText] = useState("");
  const [sentTo, setSentTo] = useState<Contact | null>(null);
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [totp, setTotp] = useState("");
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
    const c = sentTo && step === "code" ? sentTo : readContact(idText);
    if (!c) { setError(idText.includes("@") ? "That email doesn’t look right. Check it and try again." : "Enter your phone number, like 0803 123 4567, or your email."); return; }
    setBusy(true);
    const { error } = c.kind === "phone"
      ? await createClient().auth.signInWithOtp({ phone: c.value, options: { shouldCreateUser: false } })
      : await createClient().auth.signInWithOtp({ email: c.value, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) {
      setError(c.kind === "phone" && !smsOn && smsFailed(error.message)
        ? "We can’t send text codes right now. If you added an email to your Doova account, enter it instead. If not, email hello@getdoova.com and we’ll help you back in."
        : friendlyAuthError(error.message, c.kind));
      return;
    }
    setSentTo(c); setCode(""); setResendIn(45); setStep("code");
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo || code.length !== 6) { setError(`Enter the 6 digits from the ${sentTo?.kind === "email" ? "email" : "text"}.`); return; }
    setError(null); setBusy(true);
    const { data, error } = sentTo.kind === "phone"
      ? await createClient().auth.verifyOtp({ phone: sentTo.value, token: code, type: "sms" })
      : await createClient().auth.verifyOtp({ email: sentTo.value, token: code, type: "email" });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message, sentTo.kind)); return; }
    if (!data.user?.user_metadata?.profile_complete) { router.replace("/sign-up?step=profile"); return; }  // never finished sign-up
    // Accounts with an authenticator app (staff) also need its code before the password can change.
    const { data: aal } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
    setStep(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? "authenticator" : "password");
  }

  async function checkAuthenticator(e: React.FormEvent) {
    e.preventDefault();
    const c = totp.replace(/\D/g, "");
    if (c.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setError(null); setBusy(true);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    const { error } = factor ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: c }) : { error: new Error("no factor") };
    setBusy(false);
    if (error) { setError("That code didn’t work. Codes change every 30 seconds; try the current one."); return; }
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
      const m = error.message;
      const code = (error as { code?: string }).code ?? "";
      if (/same|different/i.test(m) || code === "same_password") setError("That’s your current password. Choose a new one, or just carry on to Doova.");
      else if (code === "insufficient_aal" || /aal2|mfa/i.test(m)) { setError(null); setStep("authenticator"); }
      else if (code === "weak_password" || /weak|should contain|at least/i.test(m)) setError(`Supabase says that password is too weak: ${m.replace(/^.*?:\s*/, "")} Try a longer one with letters and numbers.`);
      else if (code === "reauthentication_needed" || /reauthenticat/i.test(m)) setError("For safety, please start again: reload this page and get a new code.");
      else setError(`${friendlyAuthError(m)} (${m})`);
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
          <p className="c-sub">
No problem. Enter the phone number or email on your Doova account and we&rsquo;ll send you a code.
          </p>
        </div>
        <div className="c-field">
          <label className="c-label" htmlFor="fp-phone">Phone number or email</label>
          <input id="fp-phone" className="c-input" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="0803 000 0000 or ada@gmail.com"
            value={idText} onChange={(e) => setIdText(e.target.value)} aria-invalid={!!error || undefined} />
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
          <p className="c-sub">
            {sentTo?.kind === "email" ? `We emailed 6 digits to ${maskEmail(sentTo.value)}.` : `We sent 6 digits by text to ${sentTo ? maskPhone(sentTo.value) : "your phone"}.`}
          </p>
        </div>
        <CodeInput value={code} onChange={setCode} invalid={!!error} />
        {sentTo?.kind === "email" && <p className="c-small" style={{ margin: 0 }}>Not there after a minute? Check Spam and Promotions.</p>}
        {error && <p className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          {resendIn > 0
            ? <span className="c-small">Didn&rsquo;t get it? Resend in 0:{String(resendIn).padStart(2, "0")}</span>
            : <button type="button" className="c-link" onClick={() => sendCode()}>Send a new code</button>}
          <button type="button" className="c-link" onClick={() => { setStep("phone"); setError(null); }}>{sentTo?.kind === "email" ? "Change email" : "Change number"}</button>
        </div>
      </form>
    );
  }

  if (step === "authenticator") {
    return (
      <form onSubmit={checkAuthenticator} style={{ display: "flex", flexDirection: "column", gap: 22 }} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="c-title">One more check</h1>
          <p className="c-sub">Your account has an authenticator app (used for Doova admin). Enter the 6-digit code it shows to change your password.</p>
        </div>
        <div className="c-field">
          <label className="c-label" htmlFor="fp-totp">Code from your authenticator app</label>
          <input id="fp-totp" className="c-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000"
            style={{ letterSpacing: "0.2em" }} value={totp} onChange={(e) => setTotp(e.target.value)} />
        </div>
        {error && <p className="c-error" role="alert">{error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        <p className="c-small" style={{ margin: 0 }}>Lost your authenticator? Ask another Doova owner to help, or contact support.</p>
      </form>
    );
  }

  return (
    <form onSubmit={savePassword} style={{ display: "flex", flexDirection: "column", gap: 22 }} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-title">Choose a new password</h1>
        <p className="c-sub">Your {sentTo?.kind === "email" ? "email" : "phone number"} is checked. Pick a password you haven&rsquo;t used for Doova before.</p>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="fp-pass">New password</label>
        <PasswordInput id="fp-pass" autoComplete="new-password" placeholder="At least 8 characters"
          value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="fp-again">Type it again</label>
        <PasswordInput id="fp-again" autoComplete="new-password"
          value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      {error && <p className="c-error" role="alert">{error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}
