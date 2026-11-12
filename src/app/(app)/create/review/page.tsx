import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { nowMs } from "@/lib/time";
import { FLAG, shortName } from "@/lib/creator";

export const metadata: Metadata = { title: "To review" };

type Row = { id: string; task_id: string; submitted_at: string; checks: { failed?: string[]; seconds?: number } | null;
  users: { full_name: string | null; level: number } | null };

/** Every response waiting for this creator, across all their tasks, grouped by task, oldest first. */
export default async function ReviewQueue() {
  const me = await requireProfile();
  const now = nowMs();
  const db = createAdminClient();
  const { data: mine } = await db.from("tasks").select("id, title, auto_approve_hours")
    .eq("creator_type", "user").eq("creator_id", me.id).limit(1000);
  const tasks = new Map((mine ?? []).map((t) => [t.id as string, t as { id: string; title: string; auto_approve_hours: number }]));
  const { data } = tasks.size
    ? await db.from("submissions").select("id, task_id, submitted_at, checks, users!submissions_doer_id_fkey(full_name, level)")
        .in("task_id", [...tasks.keys()]).eq("status", "submitted").order("submitted_at", { ascending: true }).limit(500)
    : { data: [] };
  const rows = (data ?? []) as unknown as Row[];
  const groups = [...new Set(rows.map((r) => r.task_id))].map((id) => ({ task: tasks.get(id)!, rows: rows.filter((r) => r.task_id === id) }));
  const hoursLeft = (r: Row, h: number) => Math.max(0, Math.round((new Date(r.submitted_at).getTime() + h * 3600_000 - now) / 3600_000));

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="c-small">{rows.length} waiting</span>
        <h1 className="c-title">To review</h1>
      </div>
      {rows.length === 0 ? (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="check" size={30} /></span>
          <h3 className="c-h2">All caught up</h3>
          <p className="c-sub" style={{ maxWidth: 380 }}>New responses that need you appear here. Anything you don&rsquo;t decide in time is approved and paid automatically.</p>
        </div>
      ) : (
        <>
          <p className="c-small" style={{ margin: 0 }}>Anything you don&rsquo;t decide in time is approved and paid automatically. Oldest first.</p>
          {groups.map((g) => (
            <section key={g.task.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <h2 className="c-sec" style={{ margin: 0 }}>{g.task.title} · {g.rows.length}</h2>
                <Link href={`/create/tasks/${g.task.id}/review/${g.rows[0].id}`} className="c-link">Start with the oldest</Link>
              </div>
              <div className="c-group">
                {g.rows.map((s) => (
                  <Link key={s.id} href={`/create/tasks/${g.task.id}/review/${s.id}`} className="c-row">
                    <span className="c-ico" style={{ background: "var(--c-paid-soft)", fontWeight: 700, fontSize: 13 }}>{shortName(s.users?.full_name ?? null).slice(0, 2).toUpperCase()}</span>
                    <span className="c-row-main">
                      <span className="c-row-title">{shortName(s.users?.full_name ?? null)}</span>
                      <span className="c-small">Level {s.users?.level ?? 1}{s.checks?.seconds ? ` · took ${Math.max(1, Math.round(s.checks.seconds / 60))} min` : ""} · approves itself in {hoursLeft(s, g.task.auto_approve_hours)} h</span>
                      {(s.checks?.failed ?? []).map((f) => <span key={f} className="c-pill c-pill-bad" style={{ alignSelf: "flex-start" }}>{FLAG[f] ?? f}</span>)}
                    </span>
                    <Icon name="chev" size={16} />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
