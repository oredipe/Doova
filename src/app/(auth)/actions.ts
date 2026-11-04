"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVACY_POLICY_VERSION } from "@/lib/env";

export type ProfileFormState = { error?: string; field?: "name" | "password" };

/** Last sign-up step: the person's name (as on their NIN) and a password. */
export async function completeProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const password = String(form.get("password") ?? "");
  const mode = form.get("mode") === "create" ? "create" : "earn";

  if (name.length < 3 || !name.includes(" ")) return { error: "Enter your first and last name, as they are on your NIN.", field: "name" };
  if (name.length > 80) return { error: "That name is too long.", field: "name" };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", field: "password" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Your session ended. Start again from your phone number." };

  const { error: pwError } = await supabase.auth.updateUser({
    password,
    data: { full_name: name, profile_complete: true },
  });
  if (pwError) return { error: "We couldn’t save your password. Try a different one.", field: "password" };

  // The database trigger created the row when the phone was first verified; fill it in.
  const db = createAdminClient();
  const { error: rpcError } = await db.rpc("create_user_profile", {
    p_id: auth.user.id,
    p_phone: auth.user.phone ?? "",
    p_full_name: name,
    p_policy_version: PRIVACY_POLICY_VERSION,
  });
  if (rpcError) return { error: "We couldn’t create your account. Please try again." };
  const { error: upError } = await db
    .from("users")
    .update({ full_name: name, app_mode: mode, privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_consent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", auth.user.id);
  if (upError) return { error: "We couldn’t save your name. Please try again." };

  redirect("/tasks?welcome=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
