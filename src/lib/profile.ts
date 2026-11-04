import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  phone: string;
  full_name: string | null;
  kyc_tier: number;
  level: number;
  xp: number;
  streak_days: number;
  creator_tier: number;
  app_mode: "earn" | "create";
};

/** The signed-in person's Doova profile. Sends them to sign in, or to finish sign-up, if needed. */
export async function requireProfile(): Promise<Profile> {
  const user = await getAuthUser();
  if (!user) redirect("/sign-in");
  const db = createAdminClient();
  const { data, error } = await db
    .from("users")
    .select("id, phone, full_name, kyc_tier, level, xp, streak_days, creator_tier, app_mode")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load your profile: " + error.message);
  if (!data || !data.full_name) redirect("/sign-up?step=profile");
  return data as Profile;
}

export function initialsOf(name: string | null): string {
  if (!name) return "D";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function naira(kobo: number): string {
  return "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
}
