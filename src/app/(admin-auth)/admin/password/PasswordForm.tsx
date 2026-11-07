"use client";
import { useActionState } from "react";
import { changeAdminPassword } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(changeAdminPassword, {});
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="c-field"><span className="c-label">New password (at least 10 characters)</span>
        <input className="c-input" name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
      <label className="c-field"><span className="c-label">Type it again</span>
        <input className="c-input" name="again" type="password" autoComplete="new-password" minLength={10} required /></label>
      {state.error && <p className="c-error" role="alert">{state.error}</p>}
      <button className="c-btn c-btn-primary c-btn-block" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
