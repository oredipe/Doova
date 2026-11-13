"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { checkNin, logNinCheck, ninHash } from "@/lib/identity";
import { loadDetails } from "@/lib/profile";
import { createRecipient, friendlyPaystackError, listBanks, resolveAccount } from "@/lib/paystack";
import { sendPayout } from "@/lib/payouts";
import { kickPush } from "@/lib/push";
import { smsCodesOn } from "@/lib/authChannels";

const back = (base: string, q: Record<string, string>) => redirect(`${base}/withdraw?${new URLSearchParams(q)}`);

export async function verifyNin(base: string, form: FormData) {
  kickPush();
  const me = await requireProfile();
  const nin = String(form.get("nin") ?? "").replace(/\D/g, "");
  if (form.get("consent") !== "on") back(base, { error: "Tick the box to let Doova check your NIN." });
  const details = await loadDetails(me);
  const r = await checkNin(nin, { id: me.id, name: me.full_name ?? "", dob: details.date_of_birth });
  if (!r.ok) { back(base, { error: r.error }); return; }
  // With a date of birth from the NIN, the 13 Nov database function also saves it (accounts from before 12 Nov have none).
  const { error } = r.dob
    ? await createAdminClient().rpc("record_nin_check", { p_user: me.id, p_nin_hash: ninHash(nin), p_legal_name: r.legalName, p_dob: r.dob })
    : await createAdminClient().rpc("record_nin_check", { p_user: me.id, p_nin_hash: ninHash(nin), p_legal_name: r.legalName });
  if (error) {
    const dup = error.message.includes("already linked");
    await logNinCheck(me.id, dup ? "duplicate" : "error", true, dup ? undefined : error.message);
    back(base, { error: dup ? "This NIN is already linked to another Doova account. Each person can have one account." : "Something went wrong. Please try again." });
  }
  await logNinCheck(me.id, "passed", true);
  revalidatePath(base);
  back(base, { done: "nin" });
}

export async function saveBank(base: string, form: FormData) {
  kickPush();
  const me = await requireProfile();
  const bankCode = String(form.get("bank") ?? "");
  const number = String(form.get("account") ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(number)) back(base, { error: "An account number is 10 digits." });
  const bank = (await listBanks()).find((b) => b.code === bankCode);
  if (!bank) back(base, { error: "Choose your bank." });
  const db = createAdminClient();
  const { data: u } = await db.from("users").select("legal_name").eq("id", me.id).maybeSingle();
  let accountName: string, recipient: string;
  try {
    accountName = await resolveAccount(number, bankCode, u?.legal_name ?? me.full_name ?? "");
    recipient = await createRecipient(accountName, number, bankCode);
  } catch (e) {
    back(base, { error: friendlyPaystackError(e) });
    return;
  }
  const { error } = await db.rpc("save_bank_account", {
    p_owner_type: "user", p_owner_id: me.id, p_by: me.id, p_bank_code: bankCode, p_bank_name: bank!.name,
    p_account_number: number, p_account_name: accountName, p_recipient_code: recipient,
  });
  if (error) {
    back(base, { error: error.message.includes("another Doova account")
      ? "This bank account is already linked to another Doova account. Each person can have one account."
      : error.message.includes("does not match")
      ? `This account is in the name ${accountName}, which doesn't match the name on your NIN (${u?.legal_name}). Withdrawals only go to accounts in your own name.`
      : "Something went wrong. Please try again." });
  }
  revalidatePath(base);
  back(base, { done: "bank" });
}

export async function withdraw(purse: "earnings" | "funds", base: string, form: FormData) {
  kickPush();
  const me = await requireProfile();
  if (!me.phone && (await smsCodesOn())) back(base, { error: "Add your phone number first." });
  const naira = Number(String(form.get("amount") ?? "").replace(/[₦,\s]/g, ""));
  if (!Number.isFinite(naira) || naira <= 0) back(base, { error: "Enter how much to withdraw." });
  const db = createAdminClient();
  const { data: bank } = await db.from("bank_accounts").select("id").eq("owner_type", "user").eq("owner_id", me.id).eq("is_default", true).maybeSingle();
  if (!bank) back(base, { error: "Add your bank account first." });
  const { data: payoutId, error } = await db.rpc("request_withdrawal", {
    p_owner_type: "user", p_owner_id: me.id, p_requested_by: me.id, p_bank_account: bank!.id,
    p_amount_kobo: Math.round(naira * 100), p_provider: "paystack", p_close_account: false, p_purse: purse,
  });
  if (error) {
    const m = error.message;
    back(base, { error: m.includes("minimum withdrawal") ? "The smallest withdrawal is ₦1,500."
      : m.includes("insufficient") ? "That's more than you have available."
      : m.includes("paused") ? "Withdrawals are paused for a short check on our side. Your money is safe; try again in a few hours."
      : m.includes("NIN") ? "Check your NIN first."
      : "Something went wrong. Please try again." });
  }
  const sent = await sendPayout(String(payoutId));
  revalidatePath(base);
  if (!sent.ok) back(base, { error: sent.error ?? "The transfer didn't go through." });
  redirect(`${base}?withdrawn=${naira}`);
}
