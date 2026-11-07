import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { runModerationChecks } from "@/lib/moderation";
import type { FormSchema } from "@/lib/tasks";
import { ago, lagosDate, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { Top } from "../Top";

export const metadata: Metadata = { title: "Task approvals" };

type Row = { id: string; title: string; instructions: string; reward_kobo: number; slots: number; estimated_minutes: number;
  funded_at: string | null; form_schema: FormSchema | null; creator_id?: string; created_by_user_id?: string; moderation_note?: string | null; moderated_at?: string | null; went_live_at?: string | null; status?: string };

export default async function TaskApprovals({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const me = await requireStaff("task.moderate");
  const sp = await searchParams;
  const now = nowMs();
  const db = createAdminClient();
  const cols = "id, title, instructions, reward_kobo, slots, estimated_minutes, funded_at, form_schema, creator_id, created_by_user_id";
  const [{ data: waiting }, { data: decided }] = await Promise.all([
    db.from("tasks").select(cols).eq("status", "under_moderation").order("funded_at").limit(200),
    db.from("tasks").select(cols + ", moderation_note, moderated_at, went_live_at, status").not("moderated_at", "is", null).order("moderated_at", { ascending: false }).limit(20),
  ]);
  const rows = (waiting ?? []) as unknown as Row[];
  const recent = (decided ?? []) as unknown as Row[];
  return (
    <>
      <Top title="Task approvals" sub="Every task is checked before it goes live (pilot). Aim for under 4 hours." />
      <div className="ops-body">
        {sp.done && <div className="c-note" role="status"><Icon name="check" size={18} /><span>{sp.done === "approved" ? "Approved. The task is live now." : "Turned down. The creator got all their money back, fee included, with your note."}</span></div>}
        {rows.length === 0 ? (
          <div className="c-card"><p className="c-sub">Nothing waiting. Funded tasks appear here straight away.</p></div>
        ) : (
          <div className="c-group">
            {rows.map((t) => {
              const flags = runModerationChecks(t).filter((c) => !c.ok && !c.warn);
              const since = new Date(t.funded_at ?? now).getTime();
              return (
                <Link key={t.id} href={`/admin/tasks/${t.id}`} className="c-row">
                  <span className="c-row-main">
                    <span className="c-row-title">{t.title}</span>
                    <span className="c-small">{naira(t.reward_kobo)} a slot · {t.slots} slots · about {t.estimated_minutes} min</span>
                    {(t.creator_id === me.id || t.created_by_user_id === me.id) && <span className="c-pill c-pill-quiet" style={{ alignSelf: "flex-start", marginTop: 4 }}>Your own task: another staff member decides</span>}
                    {flags.length > 0
                      ? <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{flags.map((f) => <span key={f.title} className="c-pill c-pill-bad">{f.title}</span>)}</span>
                      : <span className="c-pill c-pill-lime" style={{ alignSelf: "flex-start", marginTop: 4 }}>No flags</span>}
                  </span>
                  <span className="c-small" style={{ whiteSpace: "nowrap", color: now - since > 4 * 3600_000 ? "var(--c-bad)" : undefined }}>Waiting {ago(since, now)}</span>
                  <Icon name="chev" size={16} />
                </Link>
              );
            })}
          </div>
        )}
        {recent.length > 0 && (
          <>
            <h2 className="c-sec">Recently decided</h2>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Task</th><th>Decision</th><th>Note</th><th>When</th></tr></thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={`/admin/tasks/${t.id}`}>{t.title}</Link></td>
                      <td>{t.went_live_at ? <span className="c-pill c-pill-lime">Approved</span> : <span className="c-pill c-pill-bad">Turned down</span>}</td>
                      <td className="c-small">{t.moderation_note ?? "—"}</td>
                      <td className="c-small" style={{ whiteSpace: "nowrap" }}>{lagosDate(t.moderated_at!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
