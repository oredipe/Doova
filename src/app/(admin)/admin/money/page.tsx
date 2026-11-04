import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, lagosDate, lagosToday, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { Top } from "../Top";
import { explainDifference, recordStatement } from "./actions";

export const metadata: Metadata = { title: "Money check" };

type R = { id: number; provider: string; statement_date: string; statement_kobo: number; ledger_kobo: number; difference_kobo: number; note: string | null; withdrawals_paused: boolean };

const DONE: Record<string, string> = {
  matched: "Matched. Our records and the statement agree to the kobo.",
  different: "There's a difference, so withdrawals are paused. Find the cause, explain it below, then an owner can switch withdrawals back on.",
  explained: "Explanation saved.",
};

export default async function MoneyCheck({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireStaff("money.view");
  const sp = await searchParams;
  const now = nowMs();
  const db = createAdminClient();
  const [totals, recs, drift, trial, paused] = await Promise.all([
    db.from("v_money_totals").select("bucket, balance_kobo"),
    db.from("reconciliations").select("id, provider, statement_date, statement_kobo, ledger_kobo, difference_kobo, note, withdrawals_paused").order("statement_date", { ascending: false }).order("provider").limit(60),
    db.from("v_ledger_balance_drift").select("code", { count: "exact", head: true }),
    db.from("v_ledger_trial_balance").select("debit_side_kobo, credit_side_kobo").maybeSingle(),
    db.from("platform_settings").select("value").eq("key", "withdrawals_paused").maybeSingle(),
  ]);
  const t = Object.fromEntries((totals.data ?? []).map((r) => [r.bucket as string, Number(r.balance_kobo)]));
  const v = (k: string) => t[k] ?? 0;
  const owed = v("earnings") + v("creator_funds") + v("business_funds") + v("task_escrow") + v("payouts_in_flight");
  const custody = v("custody_paystack") + v("custody_monnify");
  const doovaNet = v("platform_revenue") - v("processor_fees");
  const rows = (recs.data ?? []) as R[];
  const latest = rows[0];
  const booksOk = (drift.count ?? 0) === 0 && Number(trial.data?.debit_side_kobo ?? 0) === Number(trial.data?.credit_side_kobo ?? 0);
  const today = lagosToday(now);

  return (
    <>
      <Top title="Money check" sub="Every morning, the money in our records is checked against the partner statements" />
      <div className="ops-body">
        {sp.done && <div className={sp.done === "different" ? "c-error" : "c-note"} role="status">{sp.done !== "different" && <Icon name="check" size={18} />}<span>{DONE[sp.done]}</span></div>}
        {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
        {paused.data?.value === true && sp.done !== "different" && <p className="c-error">Withdrawals are paused until a difference is explained and an owner switches them back on in <Link href="/admin/settings">Settings</Link>.</p>}

        <section className="c-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="c-small">What Doova owes users (our records)</span>
            <strong style={{ fontSize: 34, letterSpacing: "-0.03em" }}>{naira(owed)}</strong>
            <span className="c-small">Plus Doova&rsquo;s own fees not yet moved: {naira(doovaNet)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="c-small">Our records of what the partners hold</span>
            <strong style={{ fontSize: 34, letterSpacing: "-0.03em" }}>{naira(custody)}</strong>
            <span className="c-small">Paystack {naira(v("custody_paystack"))} · Monnify {naira(v("custody_monnify"))}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <span className={booksOk ? "c-pill c-pill-lime" : "c-pill c-pill-bad"}><Icon name={booksOk ? "check" : "x"} size={12} stroke={2.4} /> {booksOk ? "Our books balance" : "Books out of balance: tell the developer now"}</span>
            {latest ? <span className={Number(latest.difference_kobo) === 0 ? "c-pill c-pill-lime" : latest.note ? "c-pill c-pill-quiet" : "c-pill c-pill-bad"}>
              {Number(latest.difference_kobo) === 0 ? "Last check matched" : latest.note ? "Last difference explained" : `Last check: ${naira(Math.abs(Number(latest.difference_kobo)))} difference`} · {lagosDate(latest.statement_date + "T12:00:00+01:00", { day: "numeric", month: "short" })}
            </span> : <span className="c-pill c-pill-quiet">Not checked against a statement yet</span>}
          </div>
        </section>

        <div className="ops-two">
          <div className="ops-col">
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Where users&rsquo; money sits</h2>
              <div className="ops-kv"><span>Creator funds (people)</span><span>{naira(v("creator_funds"))}</span></div>
              {v("business_funds") > 0 && <div className="ops-kv"><span>Business funds</span><span>{naira(v("business_funds"))}</span></div>}
              <div className="ops-kv"><span>Locked in tasks</span><span>{naira(v("task_escrow"))}</span></div>
              <div className="ops-kv"><span>Doers&rsquo; Earnings</span><span>{naira(v("earnings"))}</span></div>
              <div className="ops-kv"><span>Withdrawals on the way</span><span>{naira(v("payouts_in_flight"))}</span></div>
              <div className="ops-kv"><span style={{ color: "var(--c-ink)", fontWeight: 600 }}>Total owed to users</span><span>{naira(owed)}</span></div>
              <p className="c-small" style={{ marginTop: 10 }}>This money belongs to users. It never pays Doova&rsquo;s bills. If our records and a statement ever differ, withdrawals pause until the difference is explained.</p>
            </section>
          </div>
          <div className="ops-col">
            {can(me.role, "reconcile") && (
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 6 }}>Record today&rsquo;s statement</h2>
                <p className="c-small" style={{ marginBottom: 12 }}>Type the closing balance from the partner&rsquo;s statement. We compare it with our records to the kobo.</p>
                <form action={recordStatement} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label className="c-field"><span className="c-label">Partner</span>
                      <select name="provider" className="c-input" defaultValue="paystack"><option value="paystack">Paystack</option><option value="monnify">Monnify</option></select></label>
                    <label className="c-field"><span className="c-label">Statement date</span>
                      <input name="date" type="date" className="c-input" defaultValue={today} max={today} required /></label>
                  </div>
                  <label className="c-field"><span className="c-label">Closing balance (₦)</span>
                    <input name="amount" className="c-input" inputMode="decimal" placeholder="e.g. 6,105,200.00" required /></label>
                  <label className="c-field"><span className="c-label">Note (optional)</span>
                    <input name="note" className="c-input" maxLength={300} /></label>
                  <button className="c-btn c-btn-primary c-btn-block">Check against our records</button>
                </form>
              </section>
            )}
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Doova&rsquo;s own money</h2>
              <div className="ops-kv"><span>Fees earned</span><span>{naira(v("platform_revenue"))}</span></div>
              <div className="ops-kv"><span>Partner fees we paid</span><span>{v("processor_fees") ? "−" : ""}{naira(v("processor_fees"))}</span></div>
              <div className="ops-kv"><span style={{ color: "var(--c-ink)", fontWeight: 600 }}>Not yet moved to Doova&rsquo;s account</span><span>{naira(doovaNet)}</span></div>
              <p className="c-small" style={{ marginTop: 10 }}>Moving fees to Doova&rsquo;s own account arrives with the Paystack connection. Only final fees can move, never money still locked.</p>
            </section>
          </div>
        </div>

        <h2 className="c-sec">Daily checks</h2>
        {rows.length === 0 ? <div className="c-card"><p className="c-sub">No checks yet. Record the first statement above once Paystack is connected.</p></div> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Day</th><th>Partner</th><th>Our records</th><th>Statement</th><th>Difference</th><th>Result</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{lagosDate(r.statement_date + "T12:00:00+01:00", { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="c-small" style={{ textTransform: "capitalize" }}>{r.provider}</td>
                  <td>{naira(r.ledger_kobo)}</td><td>{naira(r.statement_kobo)}</td>
                  <td style={{ color: Number(r.difference_kobo) ? "var(--c-bad)" : undefined, fontWeight: 600 }}>{Number(r.difference_kobo) < 0 ? "−" : ""}{naira(Math.abs(Number(r.difference_kobo)))}</td>
                  <td>
                    {Number(r.difference_kobo) === 0 ? <span className="c-pill c-pill-lime">Matched</span> : r.note ? (
                      <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><span className="c-pill c-pill-quiet">Explained</span><span className="c-small">{r.note}</span></span>
                    ) : can(me.role, "reconcile") ? (
                      <form action={explainDifference.bind(null, r.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input name="note" className="c-input" style={{ minHeight: 40, width: 260 }} placeholder="What caused the difference?" required />
                        <button className="c-btn c-btn-quiet" style={{ minHeight: 40 }}>Save</button>
                      </form>
                    ) : <span className="c-pill c-pill-bad">Not explained</span>}
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
