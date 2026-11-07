"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimatedTransferFeeKobo, verifyTransfer } from "@/lib/paystack";
import { requireStaff } from "@/lib/staff";
import { kickPush } from "@/lib/push";

/** Ask Paystack for a transfer's real status, for when a webhook went missing. */
export async function checkPayout(id: string) {
  kickPush();
  const me = await requireStaff("payout.retry");
  const db = createAdminClient();
  let msg: string;
  try {
    const t = await verifyTransfer(id);
    if (t.status === "success") {
      const { data: p } = await db.from("payouts").select("transfer_kobo").eq("id", id).maybeSingle();
      await db.rpc("confirm_payout", { p_payout: id, p_provider_ref: t.transfer_code, p_processor_fee_kobo: Number(t.fee_charged ?? estimatedTransferFeeKobo(Number(p?.transfer_kobo ?? 0))) });
      msg = "Paystack says it was paid. Marked as paid.";
    } else if (t.status === "failed" || t.status === "reversed") {
      await db.rpc("fail_payout", { p_payout: id, p_reason: String(t.gateway_response ?? t.status).slice(0, 200) });
      msg = "Paystack says it failed. The money is back in the person's balance.";
    } else msg = `Paystack says it's still ${t.status}. Check again later.`;
  } catch {
    msg = "Paystack has no transfer with this reference. It may never have been sent; tell the developer.";
  }
  await db.rpc("log_staff_action", { p_staff: me.id, p_action: "payout.check", p_target_type: "payout", p_target_id: id, p_detail: { result: msg } });
  revalidatePath("/admin/payouts");
  redirect(`/admin/payouts?tab=waiting&checked=${encodeURIComponent(msg)}`);
}
