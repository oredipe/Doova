"use client";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/notificationActions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

function urlBase64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** "Phone notifications: Turn on / Turn off" for this phone or browser. */
export function PushToggle({ publicKey, compact = false }: { publicKey: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported"); return;
      }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setErr(null); setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const r = await savePushSubscription(sub.toJSON() as never, navigator.userAgent);
      setState(r.ok ? "on" : "off");
      if (!r.ok) setErr("Couldn't save this phone. Please try again.");
    } catch {
      setErr("This browser didn't allow notifications. Try Chrome, or check your phone's settings.");
      setState("off");
    }
  }
  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  }

  const text: Record<State, string> = {
    loading: "Checking…",
    unsupported: "This browser can't show phone notifications. Chrome on Android works best.",
    "ios-install": "On iPhone: tap Share, then “Add to Home Screen”, open Doova from there, and turn notifications on.",
    denied: "Notifications are blocked for Doova. Allow them in your browser or phone settings, then come back.",
    off: compact ? "Get a ping the minute you're paid." : "Get a ping when you're paid, when work needs review, and when new tasks arrive.",
    on: "On for this phone.",
    busy: "One moment…",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 220px" }}>
        <strong style={{ fontSize: 15 }}>Phone notifications</strong>
        <span className="c-small">{text[state]}</span>
        {err && <span className="c-small" style={{ color: "var(--c-bad)" }}>{err}</span>}
      </span>
      {(state === "off" || state === "busy") && <button className="c-btn c-btn-primary" style={{ minHeight: 40 }} onClick={turnOn} disabled={state === "busy"}>Turn on</button>}
      {state === "on" && <button className="c-btn c-btn-quiet" style={{ minHeight: 40 }} onClick={turnOff}>Turn off</button>}
    </div>
  );
}
