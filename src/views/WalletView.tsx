import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountNumber } from "./AccountNumber";
import { naira, requireProfile } from "@/lib/profile";

type Entry = { entry_id: number; kind: string; memo: string | null; reference_type: string | null; reference_id: string | null; amount_kobo: number; created_at: string };

const LABEL: Record<string, string> = {
  release_reward: "Task paid", deposit: "Money added", withdrawal_request: "Withdrawal", payout_reversed: "Withdrawal returned",
  refund_escrow: "Unused task money returned", fund_task: "Task funded", chargeback: "Card payment reversed",
};

/** Each person has two balances: Earnings (Earn) and Creator funds (Create). */
export async function WalletView({ purse, sp = {} }: { purse: "earnings" | "funds"; sp?: { withdrawn?: string; acct_error?: string } }) {
  const base = purse === "earnings" ? "/wallet" : "/create/wallet";
  const earn = purse === "earnings";
  const me = await requireProfile();
  const db = createAdminClient();
  const [{ data: bal }, { data: hist }, { data: pending }, { data: payouts }] = await Promise.all([
    db.from("v_wallet_balances").select("balance_kobo").eq("owner_type", "user").eq("owner_id", me.id).eq("purse", purse).maybeSingle(),
    db.from("v_wallet_history").select("entry_id, kind, memo, reference_type, reference_id, amount_kobo, created_at")
      .eq("owner_type", "user").eq("owner_id", me.id).eq("purse", purse).order("created_at", { ascending: false }).limit(100),
    db.from("submissions").select("tasks(reward_kobo)").eq("doer_id", me.id).in("status", ["submitted", "appealed"]),
    db.from("payouts").select("id, amount_kobo, transfer_kobo, status, failure_reason, requested_at, bank_accounts(bank_name, account_number)")
      .eq("owner_type", "user").eq("owner_id", me.id).eq("purse", purse).order("requested_at", { ascending: false }).limit(5),
  ]);
  type Payout = { id: string; amount_kobo: number; transfer_kobo: number; status: string; failure_reason: string | null; requested_at: string; bank_accounts: { bank_name: string | null; account_number: string } | null };
  const recent = (payouts ?? []) as unknown as Payout[];
  const STATUS: Record<string, [string, string]> = { pending: ["c-pill c-pill-quiet", "Sending"], processing: ["c-pill c-pill-active", "On the way"], succeeded: ["c-pill c-pill-lime", "Sent"], failed: ["c-pill c-pill-bad", "Didn't go through"] };
  const balance = Number(bal?.balance_kobo ?? 0);
  const entries = (hist ?? []) as Entry[];
  const onTheWay = !earn ? 0 : ((pending ?? []) as unknown as { tasks: { reward_kobo: number } | null }[]).reduce((s, p) => s + (p.tasks?.reward_kobo ?? 0), 0);

  // Name each task payment after its task.
  const subIds = entries.filter((e) => e.reference_type === "submission" && e.reference_id).map((e) => e.reference_id!);
  const titles = new Map<string, string>();
  if (subIds.length) {
    const { data } = await db.from("submissions").select("id, tasks(title)").in("id", subIds);
    for (const r of (data ?? []) as unknown as { id: string; tasks: { title: string } | null }[]) titles.set(r.id, r.tasks?.title ?? "");
  }
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));

  return (
    <>
      <h1 className="c-title">{earn ? "Earnings" : "Creator funds"}</h1>
      {sp.withdrawn && <div className="c-note" role="status"><Icon name="check" size={18} /><span>Withdrawal of ₦{Number(sp.withdrawn).toLocaleString("en-NG")} is on its way to your bank. It usually arrives within minutes.</span></div>}
      <section className="c-card c-dark" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 24 }}>
        <span className="c-small">{earn ? "Available to withdraw" : "Available to fund tasks"}</span>
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em" }}>{naira(balance)}</span>
        {onTheWay > 0 && <span className="c-small">{naira(onTheWay)} on the way from work waiting for review</span>}
        <Link href={`${base}/withdraw`} className="c-btn c-btn-money" style={{ alignSelf: "flex-start" }}>Withdraw</Link>
        <span className="c-small">{earn
          ? "Money from tasks you do. Withdraw from ₦1,500 to a bank account in your name. ₦100 per withdrawal."
          : "Money you add to pay for tasks. Unused task money comes back here. You can withdraw what you don't need (₦100 per withdrawal)."}</span>
      </section>
      {!earn && (
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="c-h2">Add money</h2>
          <AccountNumber back="/create/wallet" error={sp.acct_error} />
        </section>
      )}
      {recent.length > 0 && (
        <>
          <h2 className="c-sec">Withdrawals</h2>
          <div className="c-group">
            {recent.map((p) => (
              <div key={p.id} className="c-row">
                <span className="c-row-main">
                  <span className="c-row-title" style={{ fontSize: 16 }}>{naira(p.transfer_kobo)} to {p.bank_accounts?.bank_name ?? "your bank"} ••{p.bank_accounts?.account_number.slice(-4)}</span>
                  <span className="c-small">{fmt(p.requested_at)}{p.status === "failed" ? ` · ${naira(p.amount_kobo)} is back in your balance` : ""}</span>
                </span>
                <span className={STATUS[p.status]?.[0]}>{STATUS[p.status]?.[1]}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <h2 className="c-sec">History</h2>
      {entries.length === 0 ? (
        <div className="c-card empty" style={{ padding: 28 }}>
          <p className="c-sub">{earn ? "Money you earn shows here the minute your work is approved." : "Money you add and spend on tasks shows here."}</p>
        </div>
      ) : (
        <div className="c-group">
          {entries.map((e) => (
            <div key={e.entry_id} className="c-row">
              <span className="c-row-main">
                <span className="c-row-title">{LABEL[e.kind] ?? e.memo ?? "Wallet entry"}</span>
                <span className="c-small">{titles.get(e.reference_id ?? "") || e.memo} · {fmt(e.created_at)}</span>
              </span>
              <span className="c-amt" style={{ color: e.amount_kobo > 0 ? "var(--c-ink)" : "var(--c-muted)" }}>
                {e.amount_kobo > 0 ? "+" : "−"}{naira(Math.abs(e.amount_kobo))}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
