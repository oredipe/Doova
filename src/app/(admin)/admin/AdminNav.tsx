"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number; bad?: boolean };
export function AdminNav({ groups }: { groups: { label: string; items: Item[] }[] }) {
  const path = usePathname();
  const current = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="ops-nav" aria-label="Admin">
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <div key={g.label} style={{ display: "contents" }}>
          <span className="ops-nav-label">{g.label}</span>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className="ops-link" aria-current={current(i.href) ? "page" : undefined}>
              {i.label}
              {!!i.count && <span className={i.bad ? "ops-count ops-count-bad" : "ops-count"}>{i.count}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
