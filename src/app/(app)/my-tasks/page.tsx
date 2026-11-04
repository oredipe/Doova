import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { nowMs } from "@/lib/time";
import { naira, requireProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "My tasks" };

type Row = {
  id: string; status: string; reserved_until: string; submitted_at: string | null; reviewed_at: string | null;
  task_id: string; tasks: { title: string; reward_kobo: number; auto_approve_hours: number } | null;
};

const GROUPS: { key: string; title: string; statuses: string[]; pill: string; label: string }[] = [
  { key: "doing", title: "In progress", statuses: ["reserved", "revision_requested"], pill: "c-pill c-pill-active", label: "In progress" },
  { key: "waiting", title: "Waiting for review", statuses: ["submitted", "appealed"], pill: "c-pill c-pill-quiet", label: "Waiting" },
  { key: "paid", title: "Paid", statuses: ["approved"], pill: "c-pill c-pill-lime", label: "Paid" },
  { key: "not", title: "Not approved", statuses: ["rejected", "rejected_final"], pill: "c-pill c-pill-bad", label: "Not approved" },
];

function day(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(iso)) : "";
}

export default async function MyTasksPage() {
  const me = await requireProfile();
  const now = nowMs();
  const db = createAdminClient();
  const { data } = await db.from("submissions")
    .select("id, status, reserved_until, submitted_at, reviewed_at, task_id, tasks(title, reward_kobo, auto_approve_hours)")
    .eq("doer_id", me.id).order("updated_at", { ascending: false }).limit(200);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => !(r.status === "reserved" && new Date(r.reserved_until).getTime() < now));
  const earned = rows.filter((r) => r.status === "approved").reduce((s, r) => s + (r.tasks?.reward_kobo ?? 0), 0);

  return (
    <>
      <h1 className="c-title">My tasks</h1>
      {rows.some((r) => r.status === "approved") && (
        <section className="c-card" style={{ display: "flex", gap: 24 }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="c-small">Earned on Doova</span>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{naira(earned)}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="c-small">Tasks paid</span>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{rows.filter((r) => r.status === "approved").length}</span>
          </span>
        </section>
      )}
      {rows.length === 0 && (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="mytasks" size={30} /></span>
          <h2 className="c-h2">Nothing here yet</h2>
          <p className="c-sub" style={{ maxWidth: 360 }}>Tasks you start, submit and get paid for will show here, with their status.</p>
          <Link href="/tasks" className="c-btn c-btn-primary" style={{ marginTop: 8 }}>Find a task</Link>
        </div>
      )}
      {GROUPS.map((g) => {
        const list = rows.filter((r) => g.statuses.includes(r.status));
        if (!list.length) return null;
        return (
          <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="c-sec">{g.title} · {list.length}</h2>
            <div className="c-group">
              {list.map((r) => (
                <Link key={r.id} href={g.key === "doing" ? `/tasks/${r.task_id}/do` : `/tasks/${r.task_id}/done`} className="c-row">
                  <span className="c-row-main">
                    <span className="c-row-title">{r.tasks?.title}</span>
                    <span className="c-small">
                      {g.key === "doing" ? "Finish before your time runs out"
                        : g.key === "paid" ? `Paid ${day(r.reviewed_at)}`
                        : g.key === "waiting" ? `Submitted ${day(r.submitted_at)}`
                        : `Reviewed ${day(r.reviewed_at)}`}
                    </span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span className="c-amt">{naira(r.tasks?.reward_kobo ?? 0)}</span>
                    <span className={g.pill}>{g.label}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
