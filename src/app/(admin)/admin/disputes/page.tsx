import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { ago, lagosDate, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { Top } from "../Top";

export const metadata: Metadata = { title: "Disputes" };

type A = { id: string; status: string; reason: string; created_at: string; decided_at: string | null; decision_note: string | null;
  submissions: { tasks: { title: string; reward_kobo: number } | null; users: { full_name: string | null } | null } | null };

export default async function Disputes({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  await requireStaff("appeal.decide");
  const sp = await searchParams;
  const now = nowMs();
  const db = createAdminClient();
  const sel = "id, status, reason, created_at, decided_at, decision_note, submissions(tasks(title, reward_kobo), users!submissions_doer_id_fkey(full_name))";
  const [{ data: open }, { data: done }] = await Promise.all([
    db.from("appeals").select(sel).eq("status", "open").order("created_at").limit(200),
    db.from("appeals").select(sel).neq("status", "open").order("decided_at", { ascending: false }).limit(20),
  ]);
  const rows = (open ?? []) as unknown as A[];
  const decided = (done ?? []) as unknown as A[];
  return (
    <>
      <Top title="Disputes" sub="Doers can appeal a rejection once. Decide within 24 hours." />
      <div className="ops-body">
        {sp.done && <div className="c-note" role="status"><Icon name="check" size={18} /><span>{sp.done === "doer" ? "Overturned. The doer has been paid from the task's locked money." : "Rejection kept. The slot is free for another doer."} Both sides see your reason.</span></div>}
        {rows.length === 0 ? <div className="c-card"><p className="c-sub">No open appeals.</p></div> : (
          <div className="c-group">
            {rows.map((a) => {
              const due = new Date(a.created_at).getTime() + 24 * 3600_000;
              return (
                <Link key={a.id} href={`/admin/disputes/${a.id}`} className="c-row">
                  <span className="c-row-main">
                    <span className="c-row-title">{a.submissions?.users?.full_name ?? "A doer"} · {a.submissions?.tasks?.title}</span>
                    <span className="c-small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>&ldquo;{a.reason}&rdquo;</span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span className="c-amt">{naira(a.submissions?.tasks?.reward_kobo ?? 0)}</span>
                    <span className="c-small" style={{ whiteSpace: "nowrap", color: due - now < 6 * 3600_000 ? "var(--c-bad)" : undefined, fontWeight: 600 }}>{due > now ? `Due in ${ago(now, due)}` : `Overdue ${ago(due, now)}`}</span>
                  </span>
                  <Icon name="chev" size={16} />
                </Link>
              );
            })}
          </div>
        )}
        {decided.length > 0 && (
          <>
            <h2 className="c-sec">Recently decided</h2>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Doer and task</th><th>Decision</th><th>Reason given</th><th>When</th></tr></thead>
                <tbody>{decided.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/admin/disputes/${a.id}`}>{a.submissions?.users?.full_name} · {a.submissions?.tasks?.title}</Link></td>
                    <td>{a.status === "upheld_for_doer" ? <span className="c-pill c-pill-lime">Overturned, paid</span> : <span className="c-pill c-pill-quiet">Rejection kept</span>}</td>
                    <td className="c-small">{a.decision_note}</td>
                    <td className="c-small" style={{ whiteSpace: "nowrap" }}>{a.decided_at ? lagosDate(a.decided_at) : ""}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
