"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";

// The four doer sections (30 Oct / 3 Nov): Tasks, My tasks, Wallet, Settings.
// Phones get a bottom tab bar; laptops get a top bar with the same four links.
const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/my-tasks", label: "My tasks", icon: "mytasks" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function isCurrent(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function AppNav({ initials }: { initials: string }) {
  const path = usePathname();
  return (
    <>
      <header className="shell-head">
        <div className="shell-head-in">
          <Logo href="/tasks" />
          <nav aria-label="Main" className="shell-links">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="shell-link" aria-current={isCurrent(path, l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <span style={{ flex: 1 }} />
          <Link href="/settings" aria-label="Your account"
            style={{ width: 40, height: 40, borderRadius: 999, background: "var(--c-paid-soft)", display: "flex",
                     alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
            {initials}
          </Link>
        </div>
      </header>
      <nav aria-label="Main" className="tabbar">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined}>
            <Icon name={l.icon} size={22} />
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
