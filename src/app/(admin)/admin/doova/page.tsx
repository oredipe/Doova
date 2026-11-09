import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, lagosDate, requireStaff } from "@/lib/staff";
import { TASK_STATUS, testMode } from "@/lib/creator";
import { budgetNumbers, DOOVA_ORG } from "@/lib/doova";
import { Top } from "../Top";
import { paystackConfigured } from "@/lib/paystack";
import { TopUpOptions } from "./TopUpOptions";
import { budgetFromFees, budgetGetAccountNumber, budgetRecordTransfer, budgetTestMoney } from "./actions";

export const metadata: Metadata = { title: "Doova tasks" };

const DONE: Record<string, string> = {
  fees: "Moved from earned fees into the budget.",
  transfer: "Transfer recorded. The budget is topped up.",
  test: "Test money added to the budget.",
  account: "The budget has its own account number now. Transfers into it top up the budget by themselves.",
};

type T = { id: string; title: string; status: string; reward_kobo: number; slots: number; created_at: string; went_live_at: string | null; ends_at: string };

export default async function DoovaTasks({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireStaff("task.moderate");
  const sp = await searchParams;
  const owner = can(me.role, "settings.update");
  const db = createAdminClient();
  const [money, { data: tasksData }, { data: acct }] = await Promise.all([
    budgetNumbers(),
    db.from("tasks").select("id, title, status, reward_kobo, slots, created_at, went_live_at, ends_at")
      .eq("creator_type", "org").eq("creator_id", DOOVA_ORG).neq("status", "pending_funding").order("created_at", { ascending: false }).limit(100),
    db.from("virtual_accounts").select("issuing_bank, account_number, account_name").eq("owner_type", "org").eq("owner_id", DOOVA_ORG).eq("provider", "paystack").eq("is_active", true).maybeSingle(),
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
              <TopUpOptions options={[
                {
                  id: "bank", icon: "wallet", tag: "Easiest", title: "Transfer from your bank app",
                  sub: acct ? `Send to ${acct.account_number} (${acct.issuing_bank}). Arrives by itself.` : "Get the budget its own account number, then transfer to it any time.",
                  panel: acct ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ background: "var(--c-ground)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <span className="c-small">{acct.issuing_bank}</span>
                        <strong style={{ fontSize: 24, letterSpacing: "0.04em" }}>{acct.account_number}</strong>
                        <span className="c-small">{acct.account_name}</span>
                      </div>
                      <p className="c-small" style={{ margin: 0 }}>Send from Doova&rsquo;s company account. The budget goes up within minutes. Paystack&rsquo;s fee is 1%, at most ₦300 per transfer.</p>
                    </div>
                  ) : paystackConfigured() ? (
                    <form action={budgetGetAccountNumber} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <label className="c-field"><span className="c-label">Company email (for Paystack receipts)</span>
                        <input name="email" type="email" className="c-input" defaultValue={me.email} required /></label>
                      <button className="c-btn c-btn-primary">Get an account number</button>
                    </form>
                  ) : (
                    <p className="c-small" style={{ margin: 0 }}>Available once Paystack is connected. Until then, use one of the other ways.</p>
                  ),
                },
                {
                  id: "fees", icon: "spark", title: "Use fees Doova has earned",
                  sub: `${naira(money.feesFreeKobo)} available. Users' money is never touched.`,
                  panel: (
                    <form action={budgetFromFees} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <input name="amount" className="c-input" inputMode="decimal" placeholder="Amount in ₦" aria-label="Amount from fees in naira" required style={{ flex: "1 1 140px" }} />
                      <button className="c-btn c-btn-primary" disabled={money.feesFreeKobo === 0}>Move to budget</button>
                    </form>
                  ),
                },
                {
                  id: "manual", icon: "mytasks", title: "Record a transfer by hand",
                  sub: "For money that reached the Paystack balance another way.",
                  panel: (
                    <form action={budgetRecordTransfer} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <label className="c-field"><span className="c-label">Amount that arrived (₦)</span>
                        <input name="amount" className="c-input" inputMode="decimal" placeholder="e.g. 50,000" required /></label>
                      <label className="c-field"><span className="c-label">Transfer reference</span>
                        <input name="reference" className="c-input" maxLength={80} placeholder="From the Paystack dashboard" required /></label>
                      <span className="c-small">Each reference counts once.</span>
                      <button className="c-btn c-btn-primary">Record transfer</button>
                    </form>
                  ),
                },
                ...(testMode() ? [{
                  id: "test", icon: "info" as const, tag: "Test mode", quietTag: true, title: "Add test money",
                  sub: "Pretend money for trying Doova tasks.",
                  panel: (
                    <form action={budgetTestMoney} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <input name="amount" className="c-input" inputMode="decimal" defaultValue="50000" aria-label="Test amount in naira" style={{ flex: "1 1 140px" }} />
                      <button className="c-btn c-btn-primary">Add test money</button>
                    </form>
                  ),
                }] : []),
              ]} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
