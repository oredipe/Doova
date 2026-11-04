import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { ninCheckAvailable } from "@/lib/identity";
import { listBanks, paystackConfigured } from "@/lib/paystack";
import { testMode } from "@/lib/creator";
import { AmountField } from "./AmountField";
import { saveBank, verifyNin, withdraw } from "./withdrawActions";

/** Withdraw: NIN check once → bank account in your name → amount. Same screen for Earnings and Creator funds. */
export async function WithdrawView({ purse, base, sp }: { purse: "earnings" | "funds"; base: string; sp: { error?: string; done?: string; change?: string } }) {
  const me = await requireProfile();
  const db = createAdminClient();
  const [{ data: u }, { data: bal }, { data: bank }, settings] = await Promise.all([
    db.from("users").select("kyc_tier, legal_name").eq("id", me.id).maybeSingle(),
    db.from("v_wallet_balances").select("balance_kobo").eq("owner_type", "user").eq("owner_id", me.id).eq("purse", purse).maybeSingle(),
    db.from("bank_accounts").select("bank_name, account_number, account_name").eq("owner_type", "user").eq("owner_id", me.id).eq("is_default", true).maybeSingle(),
    db.from("platform_settings").select("key, value").in("key", ["withdrawal_fee_kobo", "stamp_duty_threshold_kobo", "stamp_duty_kobo", "min_withdrawal_kobo", "withdrawals_paused"]),
  ]);
  const s = Object.fromEntries((settings.data ?? []).map((r) => [r.key as string, r.value]));
  const balance = Number(bal?.balance_kobo ?? 0);
  const step = (u?.kyc_tier ?? 0) < 1 ? "nin" : !bank || sp.change ? "bank" : "amount";
  const label = purse === "earnings" ? "Earnings" : "Creator funds";

  return (
    <>
      <Link href={base} className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none" }}>
        <Icon name="back" size={16} stroke={2} /> {label}
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="c-small">{step === "nin" ? "Step 1 of 3 · Check your NIN" : step === "bank" ? "Step 2 of 3 · Your bank account" : `From your ${label} · ${naira(balance)} available`}</span>
        <h1 className="c-title">{step === "nin" ? "First, a one-time NIN check" : step === "bank" ? "Where should we send it?" : "Withdraw"}</h1>
      </div>
      {sp.done === "nin" && <div className="c-note" role="status"><Icon name="check" size={18} /><span>NIN checked. You won&rsquo;t need to do that again.</span></div>}
      {sp.done === "bank" && <div className="c-note" role="status"><Icon name="check" size={18} /><span>Bank account saved. It matches the name on your NIN.</span></div>}
      {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
      {s.withdrawals_paused === true && <p className="c-error">Withdrawals are paused for a short check on our side. Your money is safe; try again in a few hours.</p>}
      {!paystackConfigured() && testMode() && <p className="c-small">Test mode: Paystack isn&rsquo;t connected yet, so no real money moves. The bank check and transfer are pretend.</p>}

      {step === "nin" && (
        ninCheckAvailable() ? (
          <form action={verifyNin.bind(null, base)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="c-sub" style={{ margin: 0 }}>So money only goes to the right person, we check your National Identification Number once. We keep the name it returns, never the number itself.</p>
            <label className="c-field">
              <span className="c-label">Your NIN (11 digits)</span>
              <input name="nin" className="c-input" inputMode="numeric" autoComplete="off" maxLength={14} required placeholder="12345678901" style={{ letterSpacing: "0.08em" }} />
              <span className="c-small">Don&rsquo;t know it? Dial *346# from the phone line linked to your NIN.</span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" name="consent" required style={{ marginTop: 4, width: 18, height: 18 }} />
              <span className="c-small" style={{ color: "var(--c-ink)" }}>I agree that Doova may check my NIN with NIMC through its identity partner, as described in the <Link href="/legal/privacy">Privacy policy</Link>.</span>
            </label>
            <button className="c-btn c-btn-primary c-btn-block">Check my NIN</button>
          </form>
        ) : <div className="c-card"><p className="c-sub">NIN checks aren&rsquo;t switched on yet, so withdrawals can&rsquo;t start. Your money is safe in your {label}.</p></div>
      )}

      {step === "bank" && (
        <form action={saveBank.bind(null, base)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="c-sub" style={{ margin: 0 }}>The account must be in your own name: <strong style={{ color: "var(--c-ink)" }}>{u?.legal_name}</strong>.</p>
          <label className="c-field">
            <span className="c-label">Bank</span>
            <select name="bank" className="c-input" required defaultValue="">
              <option value="" disabled>Choose your bank</option>
              {(await listBanks()).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </label>
          <label className="c-field">
            <span className="c-label">Account number</span>
            <input name="account" className="c-input" inputMode="numeric" maxLength={10} required placeholder="0123456789" />
          </label>
          <button className="c-btn c-btn-primary c-btn-block">Check and save</button>
          {bank && <Link href={`${base}/withdraw`} className="c-link" style={{ alignSelf: "center" }}>Keep {bank.bank_name} ••{bank.account_number.slice(-4)}</Link>}
        </form>
      )}

      {step === "amount" && bank && (
        balance < Number(s.min_withdrawal_kobo ?? 150000) ? (
          <div className="c-card"><p className="c-sub">You need at least ₦1,500 to withdraw. You have {naira(balance)}.</p></div>
        ) : (
          <form action={withdraw.bind(null, purse, base)} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span className="c-small">To</span>
                <strong>{bank.account_name}</strong>
                <span className="c-small">{bank.bank_name} ••{bank.account_number.slice(-4)}</span>
              </span>
              <Link href={`${base}/withdraw?change=1`} className="c-link">Change</Link>
            </div>
            <AmountField maxKobo={balance} feeKobo={Number(s.withdrawal_fee_kobo ?? 10000)} dutyFromKobo={Number(s.stamp_duty_threshold_kobo ?? 1000000)} dutyKobo={Number(s.stamp_duty_kobo ?? 5000)} />
            <span className="c-small">Usually arrives within minutes. If the bank refuses it, the whole amount comes back, fee included.</span>
          </form>
        )
      )}
    </>
  );
}
