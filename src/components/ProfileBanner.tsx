"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

export function ProfileRing({ pct, size = 52 }: { pct: number; size?: number }) {
  return (
    <span className="pf-ring" role="img" aria-label={`Profile ${pct}% complete`}
      style={{ width: size, height: size, background: `conic-gradient(var(--c-violet) 0 ${pct}%, rgba(17,17,17,0.1) ${pct}% 100%)` }}>
      <span style={{ width: size - 12, height: size - 12 }}>{pct}%</span>
    </span>
  );
}

const KEY = "doova-profile-banner";
function shown() { try { return localStorage.getItem(KEY) !== "hidden"; } catch { return true; } }
const noop = () => () => {};

/** Doer Tasks page: how complete the profile is, and a way to finish it. × hides it on this phone. */
export function ProfileBanner({ pct }: { pct: number }) {
  const show = useSyncExternalStore(noop, shown, () => false);
  const [hidden, setHidden] = useState(false);
  if (pct >= 100 || !show || hidden) return null;
  return (
    <section className="c-card" aria-label="Finish your profile" style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 16 }}>
      <ProfileRing pct={pct} />
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <strong style={{ fontSize: 16 }}>Finish your profile</strong>
        <span className="c-small" style={{ fontSize: 14, color: "#3A3A35", lineHeight: 1.4 }}>Many tasks are for certain ages or areas. A full profile shows you more of them.</span>
        <Link href="/profile" className="c-btn c-btn-primary" style={{ minHeight: 40, alignSelf: "flex-start", marginTop: 8, padding: "0 16px" }}>Finish in 1 minute</Link>
      </span>
      <button type="button" className="c-ic-btn" style={{ border: 0, marginTop: -6, marginRight: -8 }} aria-label="Hide for now"
        onClick={() => { try { localStorage.setItem(KEY, "hidden"); } catch {} setHidden(true); }}>
        <Icon name="x" size={18} stroke={2} />
      </button>
    </section>
  );
}
