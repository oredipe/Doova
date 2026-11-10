"use client";
import { useActionState, useState, useTransition } from "react";
import { confirmCode, startAuthenticator, type FormState } from "../actions";

export function VerifyForm({ hasAuthenticator, email }: { hasAuthenticator: boolean; email: string }) {
  const [setup, setSetup] = useState<FormState>({});
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState<FormState, FormData>(confirmCode, {});
  const needSetup = !hasAuthenticator && !setup.factorId;

  if (needSetup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ol className="c-sub" style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>Install an authenticator app on your phone.</li>
          <li>Tap the button below and scan the code with the app.</li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        {setup.error && <p className="c-error" role="alert">{setup.error}</p>}
        <button className="c-btn c-btn-primary c-btn-block" disabled={starting}
          onClick={() => startTransition(async () => setSetup(await startAuthenticator()))}>
          {starting ? "Starting…" : "Show my set-up code"}
        </button>
      </div>
    );
  }
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {setup.qr && (
        <div className="c-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase */}
          <img src={setup.qr} alt="QR code to scan with your authenticator app" width={180} height={180} />
          <span className="c-small" style={{ textAlign: "center" }}>Can&rsquo;t scan? Type this key into the app:<br />
            <code style={{ fontSize: 14, wordBreak: "break-all" }}>{setup.secret}</code></span>
        </div>
      )}
      <input type="hidden" name="factorId" value={setup.factorId ?? ""} />
      <label className="c-field">
        <span className="c-label">6-digit code</span>
        <input className="c-input" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000"
          style={{ letterSpacing: "0.2em" }} autoFocus required />
      </label>
      {state.error && <p className="c-error" role="alert">{state.error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={pending}>{pending ? "Checking…" : "Continue to admin"}</button>
      {setup.qr && <p className="c-small">Next time, sign in at getdoova.com/admin/sign-in with {email}, your Doova password and a code from the app.</p>}
    </form>
  );
}
