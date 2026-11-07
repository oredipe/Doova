"use client";
import { useActionState, useState } from "react";
import { addAdminOnlyStaff, addStaff, type AddStaffState } from "./actions";

const ROLES = [
  ["owner", "Owner", "Everything, including settings and staff"],
  ["moderator", "Moderator", "Task approvals, disputes, suspending accounts"],
  ["finance", "Finance", "Money check and payouts"],
  ["support", "Support", "Looking up accounts"],
] as const;

function RolePicker() {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <legend className="c-label" style={{ marginBottom: 8 }}>Role</legend>
      {ROLES.map(([v, t, s]) => (
        <label key={v} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, border: "1px solid rgba(17,17,17,.14)", cursor: "pointer" }}>
          <input type="radio" name="role" value={v} defaultChecked={v === "moderator"} style={{ marginTop: 3 }} />
          <span style={{ display: "flex", flexDirection: "column" }}><strong style={{ fontSize: 15 }}>{t}</strong><span className="c-small">{s}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

/** Add staff two ways: a separate admin-only account (email), or an existing Doova account (phone). */
export function AddStaffForm() {
  const [kind, setKind] = useState<"admin" | "doova">("admin");
  const [state, action, pending] = useActionState<AddStaffState, FormData>(addAdminOnlyStaff, {});
  const [copied, setCopied] = useState(false);

  if (state.done) {
    const d = state.done;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="c-sub" style={{ margin: 0, color: "var(--c-ink)" }}><strong>{d.name}</strong> can now sign in to admin. Send them these details privately (not in a group chat). The password is shown only once.</p>
        <div className="c-card" style={{ background: "var(--c-ground)", display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          <span>Sign in at <strong>doova-app.vercel.app/admin/sign-in</strong></span>
          <span>Email: <strong>{d.email}</strong></span>
          <span>Temporary password: <strong style={{ fontFamily: "ui-monospace, monospace" }}>{d.password}</strong></span>
        </div>
        <span className="c-small">On first sign-in they set up an authenticator app and choose their own password.</span>
        <button type="button" className="c-btn c-btn-quiet" onClick={() => { navigator.clipboard?.writeText(`Doova admin\nSign in: https://doova-app.vercel.app/admin/sign-in\nEmail: ${d.email}\nTemporary password: ${d.password}`); setCopied(true); }}>
          {copied ? "Copied" : "Copy these details"}
        </button>
        <a href="/admin/settings" className="c-link" style={{ alignSelf: "center" }}>Done</a>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="radiogroup" aria-label="Kind of account" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {([["admin", "Admin-only account", "A separate email sign-in just for admin. Best for staff."],
           ["doova", "Their Doova account", "Add admin to the account they already use with their phone."]] as const).map(([v, t, s]) => (
          <button key={v} type="button" role="radio" aria-checked={kind === v} className="c-radio" style={{ background: "#F6F6F1" }} onClick={() => setKind(v)}>
            <span className="c-radio-dot" />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong>{t}</strong><span className="c-small">{s}</span></span>
          </button>
        ))}
      </div>
      {kind === "admin" ? (
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="c-field"><span className="c-label">Full name</span><input name="name" className="c-input" required /></label>
          <label className="c-field"><span className="c-label">Work email (they sign in with this)</span><input name="email" type="email" className="c-input" required /></label>
          <RolePicker />
          {state.error && <p className="c-error" role="alert">{state.error}</p>}
          <button className="c-btn c-btn-primary c-btn-block" disabled={pending}>{pending ? "Creating…" : "Create admin account"}</button>
        </form>
      ) : (
        <form action={addStaff} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="c-small" style={{ margin: 0 }}>They need a Doova account first (sign up in the app with their phone).</p>
          <label className="c-field"><span className="c-label">Their Doova phone number</span><input name="phone" className="c-input" inputMode="tel" placeholder="0803 123 4567" required /></label>
          <label className="c-field"><span className="c-label">Work email (for admin sign-in)</span><input name="email" type="email" className="c-input" required /></label>
          <RolePicker />
          <button className="c-btn c-btn-primary c-btn-block">Add to the team</button>
        </form>
      )}
    </div>
  );
}
