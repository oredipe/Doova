"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVACY_POLICY_VERSION } from "@/lib/env";
import { readDob } from "@/lib/details";

export type ProfileFormState = { error?: string; field?: "name" | "password" | "dob" | "agree" };

/**
 * Last sign-up step: name (as on their NIN), date of birth (doers; 18 or older), a password, and the
 * "I confirm I am 18 or older and agree to the Terms and Privacy policy" tick.
 */
export async function completeProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const password = String(form.get("password") ?? "");
  const mode = form.get("mode") === "create" ? "create" : "earn";

  if (name.length < 3 || !name.includes(" ")) return { error: "Enter your first and last name, as they are on your NIN.", field: "name" };
  if (name.length > 80) return { error: "That name is too long.", field: "name" };
  let dob: string | undefined;
  if (mode === "earn") {
    const r = readDob(String(form.get("dob_d") ?? ""), String(form.get("dob_m") ?? ""), String(form.get("dob_y") ?? ""));
    if (r.error) return { error: r.error, field: "dob" };
    dob = r.dob;
  }
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", field: "password" };
  if (form.get("agree") !== "yes") return { error: "Tick the box to confirm you are 18 or older and agree to the Terms and Privacy policy.", field: "agree" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Your session ended. Start again from your phone number or email." };
  const phone = auth.user.phone || null;
  const email = auth.user.email_confirmed_at || auth.user.confirmed_at ? auth.user.email || null : null;
  if (!phone && !email) return { error: "Your session ended. Start again from your phone number or email." };

  const db = createAdminClient();
  const { data: existing } = await db.from("users").select("staff_only").eq("id", auth.user.id).maybeSingle();
  if (existing?.staff_only) return { error: "That email belongs to a Doova admin account. Sign in to the admin instead, or use another email for the app." };

  const { error: pwError } = await supabase.auth.updateUser({
    password,
    data: { full_name: name, profile_complete: true },
  });
  if (pwError) return { error: "We couldn’t save your password. Try a different one.", field: "password" };

  // The database trigger created the row when the phone or email was first used; fill it in.
  const base = { p_id: auth.user.id, p_phone: phone ?? "", p_full_name: name, p_policy_version: PRIVACY_POLICY_VERSION };
  let { error: rpcError } = await db.rpc("create_user_profile", { ...base, p_email: email });
  // Before the 10 Nov email-codes update is run, the function has no p_email; phone sign-ups still work.
  if (rpcError && phone) ({ error: rpcError } = await db.rpc("create_user_profile", base));
  if (rpcError) return { error: "We couldn’t create your account. Please try again." };
  if (email) {
    // A checked sign-in email wins over the same email typed elsewhere for receipts.
    await db.from("users").update({ email: null, updated_at: new Date().toISOString() }).eq("email", email).neq("id", auth.user.id);
  }
  const { error: upError } = await db
    .from("users")
    .update({ full_name: name, app_mode: mode, ...(email ? { email } : {}), privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_consent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", auth.user.id);
  if (upError) return { error: "We couldn’t save your name. Please try again." };
  // Date of birth and the 18+ tick (12 Nov update). Before that update is run the columns don't exist yet: carry on without.
  const { error: ageError } = await db.from("users")
    .update({ ...(dob ? { date_of_birth: dob } : {}), age_confirmed_at: new Date().toISOString() }).eq("id", auth.user.id);
  if (ageError?.message.includes("18 or older")) return { error: "You need to be 18 or older to use Doova.", field: "dob" };
  if (ageError) console.error("sign-up age details:", ageError.message);

  // Creators start on the creator side; doers on the task feed.
  redirect(mode === "create" ? "/create" : "/tasks?welcome=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
