"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { createDedicatedAccount, paystackConfigured } from "@/lib/paystack";

/** Give a creator their own account number (Paystack dedicated account). Paystack needs an email for receipts. */
export async function getAccountNumber(back: string, form: FormData) {
  const me = await requireProfile();
  const sep = back.includes("?") ? "&" : "?";
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`${back}${sep}acct_error=${encodeURIComponent("Enter an email for payment receipts.")}`);
  if (!paystackConfigured()) redirect(`${back}${sep}acct_error=${encodeURIComponent("Account numbers start once Paystack is connected.")}`);
  const db = createAdminClient();
  const { data: u } = await db.from("users").select("full_name, legal_name, phone, email").eq("id", me.id).maybeSingle();
  if (!u?.email) {
    const { error } = await db.from("users").update({ email, updated_at: new Date().toISOString() }).eq("id", me.id);
    if (error) redirect(`${back}${sep}acct_error=${encodeURIComponent("That email is already used by another Doova account.")}`);
  }
  const parts = (u?.legal_name || u?.full_name || "Doova Creator").trim().split(/\s+/);
  try {
    const a = await createDedicatedAccount({ userId: me.id, firstName: parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : parts[0], phone: u?.phone ?? me.phone ?? undefined, email: u?.email ?? email });
    await db.rpc("save_virtual_account", { p_owner_type: "user", p_owner_id: me.id, p_provider: "paystack", p_bank: a.bank,
      p_account_number: a.accountNumber, p_account_name: a.accountName, p_provider_ref: a.customerCode });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    redirect(`${back}${sep}acct_error=${encodeURIComponent(/bvn|identif|validat/i.test(m)
      ? "Paystack needs to check your identity before giving you an account number. We'll add that step soon."
      : "Paystack couldn't create your account number just now. Please try again in a minute.")}`);
  }
  revalidatePath(back.split("?")[0]);
  redirect(back);
}
