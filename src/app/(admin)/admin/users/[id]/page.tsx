import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { initialsOf, naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { TASK_STATUS } from "@/lib/creator";
import { can, lagosDate, requireStaff, ROLE_NAMES, type StaffRole } from "@/lib/staff";
import { LEVEL_NAMES, TIER_NAMES } from "@/lib/tasks";
import { Top } from "../../Top";
import { setSuspended } from "./actions";

export const metadata: Metadata = { title: "Account" };

const SUB: Record<string, string> = { reserved: "Doing it now", submitted: "Waiting for review", approved: "Paid", rejected: "Not approved",
  rejected_final: "Not approved (final)", appealed: "Appealed", expired: "Time ran out", withdrawn: "Left" };

export default async function Account({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireStaff("user.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const { data: u } = await db.from("users").select("*").eq("id", id).maybeSingle();
  if (!u) notFound();
  const [wallets, subs, tasks, staff, log] = await Promise.all([
    db.from("v_wallet_balances").select("purse, balance_kobo").eq("owner_type", "user").eq("owner_id", id),
    db.from("submissions").select("id, status, submitted_at, tasks(id, title, reward_kobo)").eq("doer_id", id).order("reserved_at", { ascending: false }).limit(20),
    db.from("tasks").select("id, title, status, reward_kobo, slots, created_at").eq("creator_type", "user").eq("creator_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("staff_members").select("role, active").eq("user_id", id).maybeSingle(),
    db.from("staff_activity").select("action, detail, created_at, users!staff_activity_staff_id_fkey(full_name)").eq("target_type", "user").eq("target_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const bal = Object.fromEntries((wallets.data ?? []).map((w) => [w.purse as string, Number(w.balance_kobo)]));
  const subRows = (subs.data ?? []) as unknown as { id: string; status: string; submitted_at: string | null; tasks: { id: string; title: string; reward_kobo: number } | null }[];
  const suspended = u.status === "suspended";

  return (
    <>
      <Top title={u.full_name ?? "Account"} sub={`${u.phone} · joined ${lagosDate(u.created_at, { day: "numeric", month: "long", year: "numeric" })}`} back={{ href: "/admin/users", label: "Users" }} />
      <div className="ops-body">
        {sp.done && <div className="c-note" role="status"><Icon name="check" size={18} /><span>{sp.done === "suspended" ? "Suspended. They can't start tasks or use the app until restored." : "Restored. They can use Doova again."}</span></div>}
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
        <div className="ops-two">
          <div className="ops-col">
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Tasks they did</h2>
              {subRows.length === 0 ? <p className="c-sub">None yet.</p> : subRows.map((s) => (
                <div key={s.id} className="ops-kv"><span>{s.tasks?.title}</span><span>{SUB[s.status] ?? s.status} · {naira(s.tasks?.reward_kobo ?? 0)}</span></div>
              ))}
            </section>
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Tasks they posted</h2>
              {(tasks.data ?? []).length === 0 ? <p className="c-sub">None yet.</p> : (tasks.data ?? []).map((t) => (
                <div key={t.id} className="ops-kv"><span>{can(me.role, "task.moderate") ? <Link href={`/admin/tasks/${t.id}`} style={{ color: "var(--c-ink)" }}>{t.title}</Link> : t.title}</span>
                  <span>{TASK_STATUS[t.status]?.label ?? t.status} · {t.slots} × {naira(t.reward_kobo)}</span></div>
              ))}
            </section>
            {(log.data ?? []).length > 0 && (
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 6 }}>Staff actions on this account</h2>
                {(log.data ?? []).map((l, i) => (
                  <div key={i} className="ops-kv"><span>{l.action.replace(".", " ")} by {(l.users as unknown as { full_name: string } | null)?.full_name}{(l.detail as { note?: string })?.note ? `: “${(l.detail as { note?: string }).note}”` : ""}</span><span className="c-small">{lagosDate(l.created_at)}</span></div>
                ))}
              </section>
            )}
          </div>
          <div className="ops-col">
            <section className="c-card">
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                <span className="c-ico" style={{ background: "var(--c-paid-soft)", fontWeight: 700, fontSize: 13 }}>{initialsOf(u.full_name)}</span>
                <span style={{ display: "flex", flexDirection: "column" }}><strong>{u.full_name}</strong>
                  <span className="c-small">{suspended ? "Suspended" : u.status === "deleted" ? "Closed" : "Active"}{u.is_flagged ? " · flagged" : ""}{staff.data?.active ? ` · Doova ${ROLE_NAMES[staff.data.role as StaffRole]}` : ""}</span></span>
              </div>
              <div className="ops-kv"><span>Doer level</span><span>{u.level} · {LEVEL_NAMES[u.level]} · {u.xp} XP</span></div>
              <div className="ops-kv"><span>Creator tier</span><span>{u.creator_tier} · {TIER_NAMES[u.creator_tier]}</span></div>
              <div className="ops-kv"><span>Checked</span><span>{u.kyc_tier ? "NIN" : "Phone only"}</span></div>
              <div className="ops-kv"><span>Earnings</span><span>{naira(bal.earnings ?? 0)}</span></div>
              <div className="ops-kv"><span>Creator funds</span><span>{naira(bal.funds ?? 0)}</span></div>
            </section>
            {can(me.role, "user.suspend") && u.status !== "deleted" && u.id !== me.id && (
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 6 }}>{suspended ? "Restore this account" : "Suspend this account"}</h2>
                <p className="c-small" style={{ marginBottom: 12 }}>{suspended ? "They'll be able to sign in and start tasks again." : "They can't use the app or start tasks. Their money stays theirs; work already submitted is still reviewed."}</p>
                <form action={setSuspended.bind(null, id, !suspended)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label className="c-field"><span className="c-label">Reason (kept in the activity log)</span>
                    <textarea name="note" className="c-input" rows={3} required maxLength={300} style={{ padding: 14 }} /></label>
                  <button className={suspended ? "c-btn c-btn-primary c-btn-block" : "c-btn c-btn-quiet c-btn-block"} style={suspended ? undefined : { color: "var(--c-bad)" }}>{suspended ? "Restore account" : "Suspend account"}</button>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
