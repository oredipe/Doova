"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";

// One account, two sides. The URL decides which shows.
// Earn: top bar on laptops, bottom tabs on phones (Tasks, My tasks, Earnings, Settings).
// Create (12 Nov): a side menu on laptops that folds to an icon rail, and bottom tabs on phones
// (Home, Tasks, Review, More). Room for Insights and whatever creators get next.
type L = { href: string; label: string; icon: IconName };
const EARN: L[] = [
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/my-tasks", label: "My tasks", icon: "mytasks" },
  { href: "/wallet", label: "Earnings", icon: "wallet" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
const CREATE_TABS: L[] = [
  { href: "/create", label: "Home", icon: "home" },
  { href: "/create/tasks", label: "Tasks", icon: "tasks" },
  { href: "/create/review", label: "Review", icon: "review" },
  { href: "/create/more", label: "More", icon: "more" },
];
const TIERS = ["", "New", "Verified", "Trusted", "Top", "Partner"];   // same as TIER_NAMES in lib/tasks

function isCurrent(path: string, href: string) {
  if (href === "/create") return path === "/create";
  if (href === "/create/more") return ["/create/more", "/create/wallet", "/create/settings", "/create/help", "/create/insights"].some((p) => path === p || path.startsWith(p + "/")) || path === "/notifications";
  return path === href || path.startsWith(href + "/");
}

// The side menu remembers whether it's folded (this browser only).
const RAIL_KEY = "doova-side-rail";
const listeners = new Set<() => void>();
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function readRail() { try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; } }
function setRail(v: boolean) { try { localStorage.setItem(RAIL_KEY, v ? "1" : "0"); } catch {} listeners.forEach((f) => f()); }

export type NavProps = { initials: string; name: string; creatorTier: number; unread?: number; toReview?: number; taskCount?: number };

export function AppNav({ initials, name, creatorTier, unread = 0, toReview = 0, taskCount = 0 }: NavProps) {
  const path = usePathname();
  const search = useSearchParams();
  const creating = path === "/create" || path.startsWith("/create/") || (path === "/notifications" && search.get("as") === "create");
  const rail = useSyncExternalStore(subscribe, readRail, () => false);
  const notifHref = creating ? "/notifications?as=create" : "/notifications";

  const bell = (
    <Link href={notifHref} className="c-ic-btn" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
      aria-current={path === "/notifications" ? "page" : undefined} style={{ position: "relative", textDecoration: "none", color: "var(--c-ink)" }}>
      <Icon name="bell" size={20} />
      {unread > 0 && path !== "/notifications" && <span aria-hidden="true" className="nav-count">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
  const avatar = (
    <Link href={creating ? "/create/settings" : "/settings"} aria-label="Your account" className="nav-avatar">{initials}</Link>
  );

  if (!creating) {
    return (
      <>
        <header className="shell-head">
          <div className="shell-head-in">
            <Logo href="/tasks" />
            <nav aria-label="Main" className="shell-links">
              {EARN.map((l) => (
                <Link key={l.href} href={l.href} className="shell-link" aria-current={isCurrent(path, l.href) ? "page" : undefined}>{l.label}</Link>
              ))}
            </nav>
            <span style={{ flex: 1 }} />
            <Link href="/create" className="c-small shell-switch" style={{ color: "var(--c-ink)", fontWeight: 600 }}>Switch to Create</Link>
            {bell}
            {avatar}
          </div>
        </header>
        <nav aria-label="Main" className="tabbar">
          {EARN.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined}>
              <Icon name={l.icon} size={22} />{l.label}
            </Link>
          ))}
        </nav>
      </>
    );
  }

  const side = (href: string, icon: IconName, label: string, extra?: React.ReactNode, current?: boolean) => (
    <Link href={href} className="side-link" aria-current={(current ?? isCurrent(path, href)) ? "page" : undefined} aria-label={rail ? label : undefined}>
      <Icon name={icon} size={20} />
      <span className="side-label">{label}</span>
      {extra}
      {rail && <span className="side-tip" aria-hidden="true">{label}</span>}
    </Link>
  );

  return (
    <>
      {/* Phones and tablets: a slim top bar and bottom tabs. */}
      <header className="shell-head shell-head-create">
        <div className="shell-head-in">
          <Logo href="/create" />
          <span className="c-pill c-pill-quiet" style={{ marginLeft: -12 }}>Create</span>
          <span style={{ flex: 1 }} />
          {bell}
          {avatar}
        </div>
      </header>

      {/* Laptops: the side menu. */}
      <aside className={rail ? "side side-rail" : "side"} aria-label="Creator menu">
        <div className="side-brand">
          {rail ? null : <><Logo href="/create" /><span className="c-pill c-pill-quiet">Create</span></>}
          <button type="button" className="side-fold" onClick={() => setRail(!rail)} aria-label={rail ? "Open the menu" : "Fold the menu"} aria-expanded={!rail}>
            <span style={{ display: "flex", transform: rail ? "rotate(180deg)" : undefined }}><Icon name="back" size={18} stroke={2} /></span>
          </button>
        </div>
        <Link href="/create/new" className="c-btn c-btn-primary side-post" aria-label={rail ? "Post a task" : undefined}>
          <Icon name="plus" size={18} stroke={2.2} />{!rail && "Post a task"}
        </Link>
        <nav aria-label="Main" className="side-nav">
          {side("/create", "home", "Overview")}
          {side("/create/tasks", "tasks", "Tasks", taskCount ? <span className="side-num">{taskCount}</span> : null)}
          {side("/create/review", "review", "To review", toReview ? <span className="side-badge" aria-label={`${toReview} waiting`}>{toReview > 99 ? "99+" : toReview}</span> : null)}
          {side("/create/insights", "data", "Insights", <span className="side-new">New</span>)}
          {side("/create/wallet", "wallet", "Funds")}
        </nav>
        <span style={{ flex: 1 }} />
        <nav aria-label="More" className="side-nav">
          {side(notifHref, "bell", "Notifications", unread ? <span className="side-dot" aria-label={`${unread} new`} /> : null, path === "/notifications")}
          {side("/create/help", "help", "Help")}
          {side("/create/settings", "settings", "Settings")}
        </nav>
        {rail ? (
          <Link href="/create/settings" aria-label={`${name}, your account`} className="nav-avatar" style={{ alignSelf: "center" }}>{initials}</Link>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link href="/create/settings" className="side-me">
              <span className="nav-avatar" aria-hidden="true" style={{ width: 36, height: 36, fontSize: 13 }}>{initials}</span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span className="c-small" style={{ fontSize: 12 }}>{TIERS[creatorTier] ?? "New"} creator · tier {creatorTier}</span>
              </span>
            </Link>
            <Link href="/tasks" className="side-switch"><Icon name="wallet" size={16} />Switch to Earn</Link>
          </div>
        )}
      </aside>

      <nav aria-label="Main" className="tabbar">
        {CREATE_TABS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined} style={{ position: "relative" }}>
            <Icon name={l.icon} size={22} />{l.label}
            {l.href === "/create/review" && toReview > 0 && <span className="nav-count tab-count" aria-label={`${toReview} waiting`}>{toReview > 9 ? "9+" : toReview}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
