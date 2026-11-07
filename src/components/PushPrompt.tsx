"use client";
import { useState, useSyncExternalStore } from "react";
import { PushToggle } from "./PushToggle";

// Should the nudge show? Only in a browser that can ask, hasn't been asked yet, and wasn't dismissed.
function shouldAsk() {
  try {
    return "Notification" in window && Notification.permission === "default" && localStorage.getItem("doova-push-prompt") !== "no";
  } catch { return false; }
}
const noop = () => () => {};

/** A one-time nudge on the Tasks page to turn phone notifications on. Dismissed for good with ×. */
export function PushPrompt({ publicKey }: { publicKey: string }) {
  const ask = useSyncExternalStore(noop, shouldAsk, () => false);
  const [hidden, setHidden] = useState(false);
  if (!ask || hidden) return null;
  return (
    <section className="c-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }} aria-label="Turn on notifications">
      <div style={{ flex: 1 }}><PushToggle publicKey={publicKey} compact /></div>
      <button className="c-ic-btn" aria-label="Not now" onClick={() => { try { localStorage.setItem("doova-push-prompt", "no"); } catch {} setHidden(true); }}>×</button>
    </section>
  );
}
