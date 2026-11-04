"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number; bad?: boolean };
export function AdminNav({ groups }: { groups: { label: string; items: Item[] }[] }) {
  const path = usePathname();
  const current = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="ad-nav" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.label} style={{ display: "contents" }}>
          <span className="ad-nav-label">{g.label}</span>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className="ad-link" aria-current={current(i.href) ? "page" : undefined}>
              {i.label}
              {!!i.count && <span className={i.bad ? "ad-count ad-count-bad" : "ad-count"}>{i.count}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
