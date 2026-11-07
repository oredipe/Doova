"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";

// Two sets of sections on one account (30 Oct / 3 Nov): Earn (Tasks, My tasks, Earnings, Settings)
// and Create (Overview, Post a task, Creator funds, Settings). The URL decides which set shows.
// Phones get a bottom tab bar; laptops get a top bar with the same links.
type L = { href: string; label: string; icon: IconName };
const EARN: L[] = [
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/my-tasks", label: "My tasks", icon: "mytasks" },
  { href: "/wallet", label: "Earnings", icon: "wallet" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
const CREATE: L[] = [
  { href: "/create", label: "Overview", icon: "tasks" },
  { href: "/create/new", label: "Post a task", icon: "plus" },
  { href: "/create/wallet", label: "Funds", icon: "wallet" },
  { href: "/create/settings", label: "Settings", icon: "settings" },
];

function isCurrent(path: string, href: string) {
  if (href === "/create") return path === "/create" || path.startsWith("/create/tasks");
  return path === href || path.startsWith(href + "/");
}

export function AppNav({ initials, unread = 0 }: { initials: string; unread?: number }) {
  const path = usePathname();
  const creating = path === "/create" || path.startsWith("/create/");
  const links = creating ? CREATE : EARN;
  return (
    <>
      <header className="shell-head">
        <div className="shell-head-in">
          <Logo href={creating ? "/create" : "/tasks"} />
          {creating && <span className="c-pill c-pill-quiet" style={{ marginLeft: -12 }}>Create</span>}
          <nav aria-label="Main" className="shell-links">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="shell-link" aria-current={isCurrent(path, l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <span style={{ flex: 1 }} />
          <Link href={creating ? "/tasks" : "/create"} className="c-small shell-switch" style={{ color: "var(--c-ink)", fontWeight: 600 }}>
            {creating ? "Switch to Earn" : "Switch to Create"}
          </Link>
          <Link href="/notifications" className="c-ic-btn" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
            aria-current={path === "/notifications" ? "page" : undefined} style={{ position: "relative", textDecoration: "none", color: "var(--c-ink)" }}>
            <Icon name="bell" size={20} />
            {unread > 0 && path !== "/notifications" && (
              <span aria-hidden="true" style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
                background: "var(--c-violet)", color: "#FFF", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link href={creating ? "/create/settings" : "/settings"} aria-label="Your account"
            style={{ width: 40, height: 40, borderRadius: 999, background: "var(--c-paid-soft)", display: "flex",
                     alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
            {initials}
          </Link>
        </div>
      </header>
      <nav aria-label="Main" className="tabbar">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined}>
            <Icon name={l.icon} size={22} />
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
