import type { Metadata } from "next";
import Link from "next/link";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { lagosDate, requireStaff } from "@/lib/staff";
import { Top } from "../Top";

export const metadata: Metadata = { title: "Payouts" };

const TABS = [
  { key: "failed", label: "Failed", statuses: ["failed"] },
  { key: "waiting", label: "On the way", statuses: ["pending", "processing"] },
  { key: "done", label: "Paid", statuses: ["succeeded"] },
];
const PILL: Record<string, [string, string]> = {
  failed: ["c-pill c-pill-bad", "Failed"], pending: ["c-pill c-pill-quiet", "Requested"], processing: ["c-pill c-pill-active", "Sending"], succeeded: ["c-pill c-pill-lime", "Paid"],
};

type P = { id: string; owner_type: string; owner_id: string; provider: string; amount_kobo: number; transfer_kobo: number; withdrawal_fee_kobo: number;
  status: string; failure_reason: string | null; requested_at: string; completed_at: string | null; purse: string };

export default async function Payouts({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff("money.view");
  const sp = await searchParams;
  const tab = TABS.find((x) => x.key === sp.tab) ?? TABS[0];
  const db = createAdminClient();
  const [{ data }, paused] = await Promise.all([
    db.from("payouts").select("id, owner_type, owner_id, provider, amount_kobo, transfer_kobo, withdrawal_fee_kobo, status, failure_reason, requested_at, completed_at, purse")
      .in("status", tab.statuses).order("requested_at", { ascending: false }).limit(200),
    db.from("platform_settings").select("value").eq("key", "withdrawals_paused").maybeSingle(),
  ]);
  const rows = (data ?? []) as P[];
  const ids = [...new Set(rows.filter((r) => r.owner_type === "user").map((r) => r.owner_id))];
  const { data: people } = ids.length ? await db.from("users").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));
  return (
    <>
      <Top title="Payouts" sub="Withdrawals to people's banks. Paystack or Monnify reports back on each one." />
      <div className="ad-body">
        {paused.data?.value === true && <p className="c-error" role="alert">Withdrawals are paused because the last money check found a difference. An owner can switch them back on in Settings once it&rsquo;s explained.</p>}
        <div className="c-note"><span>Withdrawals open once Paystack is connected. Until then nothing appears here. When a transfer fails, the full amount (fee included) goes straight back to the person&rsquo;s balance, and it shows here so you can contact them.</span></div>
        <nav className="c-tabs" aria-label="Payout status">
          {TABS.map((x) => <Link key={x.key} href={`/admin/payouts?tab=${x.key}`} className="c-tab" aria-current={x.key === tab.key ? "page" : undefined}>{x.label}</Link>)}
        </nav>
        {rows.length === 0 ? <div className="c-card"><p className="c-sub">Nothing {tab.key === "failed" ? "failed" : tab.key === "waiting" ? "on the way" : "paid yet"}.</p></div> : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>Person</th><th>Amount</th><th>Reaches their bank</th><th>From</th><th>Partner</th><th>Status</th><th>Requested</th></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.owner_type === "user" ? <Link href={`/admin/users/${p.owner_id}`}>{name.get(p.owner_id) ?? "Person"}</Link> : "Business"}</td>
                  <td>{naira(p.amount_kobo)}</td><td>{naira(p.transfer_kobo)}</td>
                  <td className="c-small">{p.purse === "earnings" ? "Earnings" : "Creator funds"}</td>
                  <td className="c-small" style={{ textTransform: "capitalize" }}>{p.provider}</td>
                  <td><span className={PILL[p.status]?.[0]}>{PILL[p.status]?.[1]}</span>{p.failure_reason && <div className="c-small" style={{ marginTop: 4 }}>{p.failure_reason}</div>}</td>
                  <td className="c-small" style={{ whiteSpace: "nowrap" }}>{lagosDate(p.requested_at)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
