"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** "Back": to the previous page when it was on Doova, otherwise to `fallback`. */
export function BackLink({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <Link href={fallback} className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none", alignSelf: "flex-start", minHeight: 44 }}
      onClick={(e) => {
        let ours = false;
        try { ours = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
        if (ours && history.length > 1) { e.preventDefault(); router.back(); }
      }}>
      <Icon name="back" size={16} stroke={2} /> {label}
    </Link>
  );
}
