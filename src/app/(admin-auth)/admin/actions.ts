"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffRow } from "@/lib/staff";

export type FormState = { error?: string; qr?: string; secret?: string; factorId?: string; email?: string };

const NOT_STAFF = "That email and password don't match a Doova staff account.";

/** Email + password + authenticator code, in one step. */
export async function adminSignIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!email || !password) return { email, error: "Enter your work email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { email, error: NOT_STAFF };

  const db = createAdminClient();
  const { data: staff } = await db.from("staff_members").select("user_id").eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return { email, error: NOT_STAFF };
  }
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) redirect("/admin/verify");                 // first time: set up the authenticator
  if (code.length !== 6) return { email, error: "Enter the 6-digit code from your authenticator app." };
  const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
  if (mfaError) return { email, error: "That code didn't work. Codes change every 30 seconds; try the current one." };
  redirect("/admin");
}

/** Staff signed in without the second step: start setting up an authenticator (shows a QR code). */
export async function startAuthenticator(): Promise<FormState> {
  const row = await getStaffRow();
  if (!row?.staff) return { error: "Sign in first." };
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Doova admin ${Date.now()}`, issuer: "Doova admin" });
  if (error || !data) return { error: "Couldn't start the set-up. Check that authenticator apps (TOTP) are switched on in Supabase, then try again." };
  return { qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
}

/** Confirm a new authenticator, or enter the code for an existing one. */
export async function confirmCode(prev: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ...prev, error: "Enter the 6-digit code from your authenticator app." };
  const supabase = await createClient();
  let factorId = String(form.get("factorId") ?? "");
  if (!factorId) {
    const { data } = await supabase.auth.mfa.listFactors();
    factorId = data?.totp?.[0]?.id ?? "";
  }
  if (!factorId) return { error: "Set up your authenticator first." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ...prev, error: "That code didn't work. Codes change every 30 seconds; try the current one." };
  redirect("/admin");
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/sign-in");
}
