import Link from "next/link";
import { Icon } from "@/components/Icon";

/** Page title bar with optional back link and a search box that searches users and tasks. */
export function Top({ title, sub, back, children }: { title: string; sub?: string; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <>
      <header className="ops-top">
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <h1>{title}</h1>
          {sub && <span className="c-small">{sub}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {children}
          <form action="/admin/users" className="ops-search" role="search" style={{ width: 300, maxWidth: "40vw" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input name="q" placeholder="Search people by name or phone" aria-label="Search people" />
          </form>
        </div>
      </header>
      {back && (
        <div style={{ padding: "16px 16px 0" }} className="ops-back">
          <Link href={back.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none", fontSize: 15 }}>
            <Icon name="back" size={16} stroke={2} /> {back.label}
          </Link>
        </div>
      )}
    </>
  );
}
