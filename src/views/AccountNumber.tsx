import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { paystackConfigured } from "@/lib/paystack";
import { getAccountNumber } from "./accountActions";

/** The creator's own account number: transfers to it land in Creator funds automatically. */
export async function AccountNumber({ back, error }: { back: string; error?: string }) {
  const me = await requireProfile();
  const db = createAdminClient();
  const [{ data: va }, { data: u }] = await Promise.all([
    db.from("virtual_accounts").select("issuing_bank, account_number, account_name").eq("owner_type", "user").eq("owner_id", me.id).eq("provider", "paystack").eq("is_active", true).maybeSingle(),
    db.from("users").select("email").eq("id", me.id).maybeSingle(),
  ]);
  if (va) {
    return (
      <div className="c-account">
        <span className="c-small">Your Doova account number</span>
        <b style={{ letterSpacing: "0.04em" }}>{va.account_number}</b>
        <span className="c-small" style={{ color: "var(--c-ink)" }}>{va.issuing_bank} · {va.account_name}</span>
        <span className="c-small">Transfer from any bank app. It lands in your Creator funds within minutes. Paystack&rsquo;s fee is 1%, at most ₦300 per transfer.</span>
      </div>
    );
  }
  if (!paystackConfigured()) {
    return (
      <div className="c-account">
        <span className="c-small">Your Doova account number</span>
        <b>Coming soon</b>
        <span className="c-small">Once Paystack is connected, you&rsquo;ll get your own account number here. Transfers land in your Creator funds within minutes.</span>
      </div>
    );
  }
  return (
    <form action={getAccountNumber.bind(null, back)} className="c-account" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="c-small">Your Doova account number</span>
      <span className="c-small" style={{ color: "var(--c-ink)" }}>Get an account number that&rsquo;s only yours. Anything you transfer to it lands in your Creator funds.</span>
      <label className="c-field">
        <span className="c-label">Email for payment receipts</span>
        <input name="email" type="email" className="c-input" defaultValue={u?.email ?? ""} required />
      </label>
      {error && <p className="c-error" role="alert">{error}</p>}
      <button className="c-btn c-btn-primary c-btn-block">Get my account number</button>
    </form>
  );
}
