import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { naira, requireProfile } from "@/lib/profile";
import { feeKobo, loadOwnTask, testMode, walletBalance } from "@/lib/creator";
import { addTestMoney, fundFromWallet } from "../actions";

export const metadata: Metadata = { title: "Fund your task" };

export default async function FundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const me = await requireProfile();
  const t = await loadOwnTask(id, me);
  if (t.status !== "pending_funding") redirect(`/create/tasks/${id}`);
  const rewards = t.reward_kobo * t.slots;
  const total = rewards + feeKobo(rewards);
  const balance = await walletBalance(me.id);
  const short = Math.max(0, total - balance);

  return (
    <>
      <Link href="/create" className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none" }}>
        <Icon name="back" size={16} stroke={2} /> Overview
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="c-small">Step 4 of 4 · Fund</span>
        <h1 className="c-title">Lock the money for &ldquo;{t.title}&rdquo;</h1>
        <p className="c-sub">The task goes live only once every reward is paid in. Doers see &ldquo;Reward locked&rdquo;, which is why they trust it.</p>
      </div>

      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span className="c-sub">{t.slots.toLocaleString("en-NG")} × {naira(t.reward_kobo)}</span><strong>{naira(rewards)}</strong></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span className="c-sub">Doova fee (15%)</span><strong>{naira(feeKobo(rewards))}</strong></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--c-line)", paddingTop: 10 }}>
          <span style={{ fontWeight: 650 }}>Total</span><span style={{ fontSize: 30, fontWeight: 700 }}>{naira(total)}</span>
        </div>
        <span className="c-small">In your wallet: {naira(balance)}</span>
      </section>

      {error && <p className="c-error" role="alert">{error}</p>}

      {short === 0 ? (
        <form action={fundFromWallet.bind(null, id)}>
          <button className="c-btn c-btn-primary c-btn-block">Pay {naira(total)} from my wallet</button>
        </form>
      ) : (
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="c-h2">Add {naira(short)} to your wallet</h2>
          <div className="c-account">
            <span className="c-small">Your Doova account number</span>
            <b>Coming soon</b>
            <span className="c-small">Once Paystack is connected, you&rsquo;ll get your own account number here. Transfers land in your wallet within minutes, at no extra cost.</span>
          </div>
          {testMode() && (
            <form action={addTestMoney.bind(null, id)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="c-btn c-btn-quiet c-btn-block">Add {naira(short)} test money</button>
              <span className="c-small">Test mode is on for the pilot: this money is pretend and only for trying the flow.</span>
            </form>
          )}
        </section>
      )}
    </>
  );
}
