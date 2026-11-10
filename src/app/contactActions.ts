"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * After someone confirms a new phone number or email with a code, copy the checked values from
 * Supabase Auth onto their Doova profile. Only values Supabase has confirmed are copied.
 */
export async function syncSignInDetails(): Promise<{ error?: string }> {
  const { data } = await (await createClient()).auth.getUser();
  const u = data.user;
  if (!u) return { error: "Your session ended. Sign in again." };
  const phone = u.phone && u.phone_confirmed_at ? (u.phone.startsWith("+") ? u.phone : "+" + u.phone) : null;
  const email = u.email && u.email_confirmed_at ? u.email.toLowerCase() : null;
  const db = createAdminClient();
  const now = new Date().toISOString();
  if (email) await db.from("users").update({ email: null, updated_at: now }).eq("email", email).neq("id", u.id);   // was only a receipts email elsewhere
  const { error } = await db.from("users").update({ ...(phone ? { phone } : {}), ...(email ? { email } : {}), updated_at: now }).eq("id", u.id);
  if (error) return { error: error.message.includes("phone") ? "That phone number is already on another Doova account." : "We couldn’t save that. Please try again." };
  revalidatePath("/", "layout");
  return {};
}
