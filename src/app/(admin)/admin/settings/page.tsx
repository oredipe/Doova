import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { lagosDate, requireStaff, ROLE_NAMES, type StaffRole } from "@/lib/staff";
import { Top } from "../Top";
import { setStaffActive, setSwitch } from "./actions";
import { AddStaffForm } from "./AddStaffForm";
import Link from "next/link";

export const metadata: Metadata = { title: "Settings" };

const SWITCHES = [
  { key: "pilot_all_tasks_need_approval", title: "Every task waits for approval", on: "Pilot rule: staff check every funded task before doers see it.", off: "Tasks go live as soon as they're funded. Not recommended during the pilot." },
  { key: "withdrawals_paused", title: "Withdrawals paused", on: "Nobody can withdraw. Switched on automatically when a money check finds a difference.", off: "People can withdraw as normal." },
];
const ACTION: Record<string, string> = {
  "task.approve": "Approved a task", "task.reject": "Turned down a task", "appeal.decide": "Decided an appeal", "user.suspend": "Suspended an account",
  "user.restore": "Restored an account", "money.check": "Recorded a statement", "money.explain": "Explained a difference", "settings.update": "Changed a setting",
  "payout.check": "Checked a payout with Paystack", "staff.add": "Added staff", "staff.password": "Changed their password", "staff.mfa_removed": "Removed an authenticator", "staff.remove": "Removed staff", "staff.restore": "Restored staff",
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const owner = me.role === "owner";
  const db = createAdminClient();
  let logQuery = db.from("staff_activity").select("id, action, target_type, target_id, detail, created_at, users!staff_activity_staff_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100);
  if (!owner) logQuery = logQuery.eq("staff_id", me.id);
  const [settings, team, log] = await Promise.all([
    db.from("platform_settings").select("key, value").in("key", SWITCHES.map((s) => s.key)),
    owner ? db.from("staff_members").select("user_id, role, email, active, added_at, users!staff_members_user_id_fkey(full_name, phone, staff_only)").order("added_at") : Promise.resolve({ data: [] }),
    logQuery,
  ]);
  const val = Object.fromEntries((settings.data ?? []).map((s) => [s.key as string, s.value === true]));
  type T = { user_id: string; role: StaffRole; email: string; active: boolean; added_at: string; users: { full_name: string | null; phone: string | null; staff_only: boolean } | null };
  const staff = (team.data ?? []) as unknown as T[];

  return (
    <>
      <Top title={owner ? "Settings" : "Your activity"} sub={owner ? "Switches, staff and the activity log. Every change is logged with your name." : "Everything you've done in admin, newest first"} />
      <div className="ops-body">
        {sp.done && <div className="c-note" role="status"><Icon name="check" size={18} /><span>{sp.done === "added" ? "Added. They sign in to the Doova app with their phone, then open doova.ng/admin to set up their authenticator."
          : sp.done === "removed_linked" ? "Removed from admin. Their authenticator was taken off too, so their Doova app account works like anyone else’s (password resets need only a text code)."
          : "Saved."}</span></div>}
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
        {owner && (
          <div className="ops-two">
            <div className="ops-col">
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 6 }}>Switches</h2>
                {SWITCHES.map((s) => (
                  <div key={s.key} className="ops-check" style={{ alignItems: "center" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                      <strong style={{ fontSize: 15 }}>{s.title}: {val[s.key] ? "on" : "off"}</strong>
                      <span className="c-small">{val[s.key] ? s.on : s.off}</span>
                    </span>
                    <form action={setSwitch.bind(null, s.key, !val[s.key])}>
                      <button className="c-btn c-btn-quiet" style={{ minHeight: 40 }}>{val[s.key] ? "Switch off" : "Switch on"}</button>
                    </form>
                  </div>
                ))}
                <p className="c-small" style={{ marginTop: 10 }}>Fees, limits and other rules stay fixed in the database for now.</p>
              </section>
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 6 }}>Team</h2>
                {staff.map((s) => (
                  <div key={s.user_id} className="ops-check" style={{ alignItems: "center", opacity: s.active ? 1 : 0.55 }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 15 }}>{s.users?.full_name} · {ROLE_NAMES[s.role]}{s.active ? "" : " · removed"}</strong>
                      <span className="c-small" style={{ overflowWrap: "anywhere" }}>{s.email} · {s.users?.staff_only ? "Admin-only account" : `Doova account ${s.users?.phone}`}</span>
                    </span>
                    {s.user_id !== me.id && (
                      <form action={setStaffActive.bind(null, s.user_id, !s.active)}>
                        <button className="c-btn c-btn-quiet" style={{ minHeight: 40 }}>{s.active ? "Remove" : "Restore"}</button>
                      </form>
                    )}
                  </div>
                ))}
              </section>
            </div>
            <div className="ops-col">
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 12 }}>Add staff</h2>
                <AddStaffForm />
              </section>
            </div>
          </div>
        )}
        <section className="c-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong>Your sign-in</strong><span className="c-small">{me.email}{me.adminOnly ? " · admin-only account" : " · linked to your Doova account"}</span></span>
          <Link href="/admin/password?change=1" className="c-btn c-btn-quiet" style={{ minHeight: 40 }}>Change password</Link>
        </section>
        <h2 className="c-sec">{owner ? "Activity log" : "Activity"}</h2>
        {(log.data ?? []).length === 0 ? <div className="c-card"><p className="c-sub">Nothing yet.</p></div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead>
              <tbody>{(log.data ?? []).map((l) => {
                const d = (l.detail ?? {}) as Record<string, unknown>;
                const detail = [d.note, d.role, d.email, d.to !== undefined ? `${l.target_id} → ${d.to ? "on" : "off"}` : null,
                  d.difference_kobo !== undefined ? `difference ₦${(Number(d.difference_kobo) / 100).toLocaleString("en-NG")}` : null,
                  d.for_doer !== undefined ? (d.for_doer ? "for the doer" : "for the creator") : null].filter(Boolean).join(" · ");
                return (
                  <tr key={l.id}>
                    <td className="c-small" style={{ whiteSpace: "nowrap" }}>{lagosDate(l.created_at)}</td>
                    <td>{(l.users as unknown as { full_name: string } | null)?.full_name}</td>
                    <td>{ACTION[l.action] ?? l.action}</td>
                    <td className="c-small">{detail}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
