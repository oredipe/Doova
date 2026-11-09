import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { SetupNeeded } from "@/components/SetupNeeded";
import { supabaseConfigured } from "@/lib/env";
import { initialsOf } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, requireStaff, ROLE_NAMES } from "@/lib/staff";
import { adminSignOut } from "@/app/(admin-auth)/admin/actions";
import { AdminNav } from "./AdminNav";

export const metadata = { title: { default: "Admin", template: "%s · Doova admin" }, robots: { index: false, follow: false } };

async function Side() {
  const me = await requireStaff();
  const db = createAdminClient();
  const [tasks, appeals, payouts, doova] = await Promise.all([
    db.from("tasks").select("id", { count: "exact", head: true }).eq("status", "under_moderation"),
    db.from("appeals").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("payouts").select("id", { count: "exact", head: true }).eq("status", "failed").is("completed_at", null),
    db.from("submissions").select("id, tasks!inner(is_doova)", { count: "exact", head: true }).eq("status", "submitted").eq("tasks.is_doova", true),
  ]);
  const create = [
    can(me.role, "task.moderate") && { href: "/admin/doova", label: "Doova tasks", count: doova.count ?? 0 },
  ].filter(Boolean) as { href: string; label: string; count?: number }[];
  const queues = [
    can(me.role, "task.moderate") && { href: "/admin/tasks", label: "Task approvals", count: tasks.count ?? 0 },
    can(me.role, "appeal.decide") && { href: "/admin/disputes", label: "Disputes", count: appeals.count ?? 0 },
    can(me.role, "money.view") && { href: "/admin/payouts", label: "Payouts", count: payouts.count ?? 0, bad: true },
  ].filter(Boolean) as { href: string; label: string; count?: number; bad?: boolean }[];
  const records = [
    can(me.role, "money.view") && { href: "/admin/money", label: "Money check" },
    can(me.role, "user.view") && { href: "/admin/users", label: "Users" },
    { href: "/admin/settings", label: me.role === "owner" ? "Settings" : "Activity" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <>
      <AdminNav groups={[{ label: "Today", items: [{ href: "/admin", label: "Overview" }] }, { label: "Queues", items: queues }, { label: "Create", items: create }, { label: "Records", items: records }]} />
      <div className="ops-me">
        <span style={{ width: 40, height: 40, borderRadius: 999, background: "var(--c-paid-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flex: "none" }}>
          {initialsOf(me.name)}
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <strong style={{ fontSize: 14, lineHeight: 1.2 }}>{me.name}</strong>
          <span className="c-small">{ROLE_NAMES[me.role]}</span>
        </span>
        <form action={adminSignOut}>
          <button className="c-ic-btn" aria-label="Sign out" title="Sign out"><Icon name="out" size={18} /></button>
        </form>
      </div>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) return <main className="auth-main"><SetupNeeded /></main>;
  return (
    <div className="ops-shell">
      <aside className="ops-side">
        <div className="ops-side-head"><Logo href="/admin" height={22} /><span className="ops-badge">ADMIN</span></div>
        <Suspense fallback={<div style={{ height: 40 }} />}><Side /></Suspense>
      </aside>
      <div className="ops-main">
        <Suspense fallback={<div className="ops-body" aria-busy="true"><div className="c-card" style={{ height: 120, opacity: 0.5 }} /></div>}>{children}</Suspense>
      </div>
    </div>
  );
}
