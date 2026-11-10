"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

function notDismissed() {
  try { return localStorage.getItem("doova-email-prompt") !== "no"; } catch { return true; }
}
const noop = () => () => {};

/** A gentle nudge for phone accounts with no email yet: add one, so a forgotten password never needs a text. Dismissed for good with ×. */
export function EmailPrompt() {
  const show = useSyncExternalStore(noop, notDismissed, () => false);
  const [hidden, setHidden] = useState(false);
  if (!show || hidden) return null;
  return (
    <section className="c-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }} aria-label="Add your email">
      <span className="c-ico"><Icon name="info" size={18} /></span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ fontSize: 15 }}>Add your email</strong>
        <span className="c-small">If you ever forget your password, we can email you a code to get back in.</span>
        <Link href="/settings#sign-in" className="c-link" style={{ marginTop: 4 }}>Add my email</Link>
      </span>
      <button className="c-ic-btn" aria-label="Not now" onClick={() => { try { localStorage.setItem("doova-email-prompt", "no"); } catch {} setHidden(true); }}>×</button>
    </section>
  );
}
