import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, lagosDate, requireStaff } from "@/lib/staff";
import { TASK_STATUS, testMode } from "@/lib/creator";
import { budgetNumbers, DOOVA_ORG } from "@/lib/doova";
import { Top } from "../Top";
import { budgetFromFees, budgetRecordTransfer, budgetTestMoney } from "./actions";

export const metadata: Metadata = { title: "Doova tasks" };

const DONE: Record<string, string> = {
  fees: "Moved from earned fees into the budget.",
  transfer: "Transfer recorded. The budget is topped up.",
  test: "Test money added to the budget.",
};

type T = { id: string; title: string; status: string; reward_kobo: number; slots: number; created_at: string; went_live_at: string | null; ends_at: string };

export default async function DoovaTasks({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireStaff("task.moderate");
  const sp = await searchParams;
  const owner = can(me.role, "settings.update");
  const db = createAdminClient();
  const [money, { data: tasksData }] = await Promise.all([
    budgetNumbers(),
    db.from("tasks").select("id, title, status, reward_kobo, slots, created_at, went_live_at, ends_at")
      .eq("creator_type", "org").eq("creator_id", DOOVA_ORG).neq("status", "pending_funding").order("created_at", { ascending: false }).limit(100),
  ]);
  const tasks = (tasksData ?? []) as T[];
  const ids = tasks.map((t) => t.id);
  const [{ data: subs }, { data: escrows }] = ids.length
    ? await Promise.all([
        db.from("submissions").select("task_id, status").in("task_id", ids).in("status", ["approved", "submitted", "reserved"]).limit(50000),
        db.from("ledger_accounts").select("owner_id, balance_kobo").eq("type", "task_escrow").in("owner_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const count = (id: string, st: string) => (subs ?? []).filter((s) => s.task_id === id && s.status === st).length;
  const locked = (escrows ?? []).reduce((s, e) => s + Number(e.balance_kobo), 0);
  const waiting = (subs ?? []).filter((s) => s.status === "submitted").length;
  const live = tasks.filter((t) => ["live", "paused", "filled"].includes(t.status)).length;

  return (
    <>
      <Top title="Doova tasks" sub="Doova's own tasks: promotions, feature tests and platform checks. No fee, no minimums.">
        {owner && <Link href="/admin/doova/new" className="c-btn c-btn-primary" style={{ minHeight: 46, whiteSpace: "nowrap" }}><Icon name="plus" size={18} /> New task</Link>}
      </Top>
      <div className="ops-body">
        {sp.done && DONE[sp.done] && <div className="c-note" role="status"><Icon name="check" size={18} /><span>{DONE[sp.done]}</span></div>}
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}

        <div className="ops-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div className="ops-stat ops-stat-money"><span className="c-small">Doova budget</span><strong>{naira(money.budgetKobo)}</strong><span className="c-small">Ready for new tasks</span></div>
          <div className="ops-stat"><span className="c-small">Locked in Doova tasks</span><strong>{naira(locked)}</strong><span className="c-small">Unused rewards return to the budget</span></div>
          <div className="ops-stat"><span className="c-small">Live now</span><strong>{live}</strong><span className="c-small">{tasks.length} in total</span></div>
          <div className="ops-stat"><span className="c-small">Responses waiting</span><strong>{waiting}</strong><span className="c-small">{waiting ? "Open a task to review" : "Nothing to review"}</span></div>
        </div>

        <div className="ops-two" style={owner ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" } : undefined}>
          <div className="ops-col">
            <h2 className="c-sec" style={{ margin: 0 }}>Tasks</h2>
            {tasks.length === 0 ? (
              <div className="c-card"><p className="c-sub">No Doova tasks yet.{owner ? " Top up the budget, then post one. A ₦0 task needs no budget at all." : " Owners post them."}</p></div>
            ) : (
              <div className="c-group">
                {tasks.map((t) => {
                  const st = TASK_STATUS[t.status] ?? TASK_STATUS.draft;
                  const w = count(t.id, "submitted");
                  return (
                    <Link key={t.id} href={`/admin/doova/${t.id}`} className="c-row">
                      <span className="c-row-main">
                        <span className="c-row-title">{t.title}</span>
                        <span className="c-small">{t.reward_kobo === 0 ? "₦0 · earns XP" : `${naira(t.reward_kobo)} a slot`} · {count(t.id, "approved")} of {t.slots.toLocaleString("en-NG")} done · posted {lagosDate(t.created_at, { day: "numeric", month: "short" })}</span>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                          <span className={st.pill}>{st.label}</span>
                          {w > 0 && <span className="c-pill c-pill-active">{w} to review</span>}
                        </span>
                      </span>
                      <Icon name="chev" size={16} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {owner && (
            <div className="ops-col">
              <h2 className="c-sec" style={{ margin: 0 }}>Top up the budget</h2>
              <section className="c-card">
                <h3 className="c-h2" style={{ marginBottom: 6, fontSize: 17 }}>From fees Doova has earned</h3>
                <p className="c-small" style={{ marginBottom: 12 }}>Available: {naira(money.feesFreeKobo)} (fees earned minus partner fees). Money that belongs to users can never be used.</p>
                <form action={budgetFromFees} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input name="amount" className="c-input" inputMode="decimal" placeholder="Amount in ₦" aria-label="Amount from fees in naira" required style={{ flex: "1 1 160px" }} />
                  <button className="c-btn c-btn-quiet" disabled={money.feesFreeKobo === 0}>Move to budget</button>
                </form>
              </section>
              <section className="c-card">
                <h3 className="c-h2" style={{ marginBottom: 6, fontSize: 17 }}>Record a company transfer</h3>
                <p className="c-small" style={{ marginBottom: 12 }}>After sending money from Doova&rsquo;s company account into the Paystack balance, record it here with its reference. Each reference counts once.</p>
                <form action={budgetRecordTransfer} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label className="c-field"><span className="c-label">Amount that arrived (₦)</span>
                    <input name="amount" className="c-input" inputMode="decimal" placeholder="e.g. 50,000" required /></label>
                  <label className="c-field"><span className="c-label">Transfer reference</span>
                    <input name="reference" className="c-input" maxLength={80} placeholder="From the Paystack dashboard" required /></label>
                  <button className="c-btn c-btn-primary c-btn-block">Record transfer</button>
                </form>
              </section>
              {testMode() && (
                <section className="c-card" style={{ border: "2px dashed var(--c-line)" }}>
                  <h3 className="c-h2" style={{ marginBottom: 6, fontSize: 17 }}>Test money</h3>
                  <p className="c-small" style={{ marginBottom: 12 }}>Test mode only. Adds pretend money so you can try Doova tasks.</p>
                  <form action={budgetTestMoney} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input name="amount" className="c-input" inputMode="decimal" defaultValue="50000" aria-label="Test amount in naira" style={{ flex: "1 1 160px" }} />
                    <button className="c-btn c-btn-quiet">Add test money</button>
                  </form>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
