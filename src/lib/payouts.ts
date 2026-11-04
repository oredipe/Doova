import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyPaystackError, paystackConfigured, sendTransfer } from "@/lib/paystack";

/**
 * After request_withdrawal has moved the money to "in flight": send the bank transfer.
 * Paystack confirms by webhook (transfer.success / failed / reversed). With no Paystack key
 * (test mode stand-in) the transfer is confirmed straight away.
 * If Paystack refuses the transfer outright, the full amount (fee included) goes back.
 */
export async function sendPayout(payoutId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const { data: p } = await db.from("payouts").select("id, transfer_kobo, status, bank_accounts(recipient_code, account_name)").eq("id", payoutId).maybeSingle();
  if (!p || p.status !== "pending") return { ok: false, error: "This withdrawal was already sent." };
  const bank = p.bank_accounts as unknown as { recipient_code: string | null; account_name: string } | null;
  if (!bank?.recipient_code) {
    await db.rpc("fail_payout", { p_payout: payoutId, p_reason: "Bank account not set up for transfers" });
    return { ok: false, error: "That bank account needs to be added again." };
  }
  try {
    const r = await sendTransfer(payoutId, Number(p.transfer_kobo), bank.recipient_code, "Doova withdrawal");
    await db.rpc("mark_payout_sent", { p_payout: payoutId, p_transfer_code: r.transferCode });
    if (!paystackConfigured()) await db.rpc("confirm_payout", { p_payout: payoutId, p_provider_ref: r.transferCode, p_processor_fee_kobo: 0 });
    return { ok: true };
  } catch (e) {
    await db.rpc("fail_payout", { p_payout: payoutId, p_reason: e instanceof Error ? e.message.slice(0, 200) : "Transfer refused" });
    return { ok: false, error: friendlyPaystackError(e) + " Your money is back in your balance." };
  }
}
