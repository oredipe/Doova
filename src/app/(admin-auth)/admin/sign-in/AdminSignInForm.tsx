"use client";
import { useActionState } from "react";
import { adminSignIn, type FormState } from "../actions";

export function AdminSignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(adminSignIn, {});
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="c-field">
        <span className="c-label">Work email</span>
        <input className="c-input" name="email" type="email" autoComplete="username" required placeholder="you@doova.ng" defaultValue={state.email} key={state.email} />
      </label>
      <label className="c-field">
        <span className="c-label">Password</span>
        <input className="c-input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <label className="c-field">
        <span className="c-label">6-digit code from your authenticator app</span>
        <input className="c-input" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000"
          style={{ letterSpacing: "0.2em" }} />
      </label>
      {state.error && <p className="c-error" role="alert">{state.error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
