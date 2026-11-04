import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletPage() {
  const me = await requireProfile();
  const db = createAdminClient();
  const { data } = await db
    .from("v_wallet_balances")
    .select("balance_kobo")
    .eq("owner_type", "user")
    .eq("owner_id", me.id)
    .maybeSingle();
  const balance = Number(data?.balance_kobo ?? 0);

  return (
    <>
      <h1 className="c-title">Wallet</h1>
      <section className="c-card c-dark" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 24 }}>
        <span className="c-small">Available</span>
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em" }}>{naira(balance)}</span>
        <button className="c-btn c-btn-money" disabled={balance < 150000} style={{ alignSelf: "flex-start" }}>
          Withdraw
        </button>
        <span className="c-small">Withdraw from ₦1,500 to any bank in your name. ₦100 per withdrawal.</span>
      </section>
      <h2 className="c-sec">History</h2>
      <div className="c-card empty" style={{ padding: 28 }}>
        <p className="c-sub">Money you earn shows here the minute your work is approved.</p>
      </div>
    </>
  );
}
