import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/server";
import type { Details } from "@/lib/details";

export type Profile = {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  kyc_tier: number;
  level: number;
  xp: number;
  streak_days: number;
  creator_tier: number;
  app_mode: "earn" | "create";
  status: "active" | "suspended" | "deleted";
  staff_only: boolean;
};

/** The signed-in person's Doova profile. Sends them to sign in, or to finish sign-up, if needed. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const user = await getAuthUser();
  if (!user) redirect("/sign-in");
  const db = createAdminClient();
  const { data, error } = await db
    .from("users")
    .select("id, phone, email, full_name, kyc_tier, level, xp, streak_days, creator_tier, app_mode, status, staff_only")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load your profile: " + error.message);
  if (!data || !data.full_name) redirect("/sign-up?step=profile");
  if (data.staff_only) redirect("/admin");      // admin-only staff accounts don't use the doer/creator app
  if (data.status !== "active") redirect("/paused");
  return data as Profile;
});

export function initialsOf(name: string | null): string {
  if (!name) return "D";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function naira(kobo: number): string {
  return "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
}

/**
 * Profile details (date of birth, where you live, gender, what you do). `ready` is false until the
 * 12 Nov database update has been run, so pages keep working before it.
 */
export const loadDetails = cache(async (me: Profile): Promise<Details & { ready: boolean }> => {
  const { data, error } = await createAdminClient().from("users")
    .select("date_of_birth, home_state, home_area, gender, occupation").eq("id", me.id).maybeSingle();
  const d = (error ? null : data) as Partial<Details> | null;
  return {
    ready: !error, phone: me.phone, email: me.email,
    date_of_birth: d?.date_of_birth ?? null, home_state: d?.home_state ?? null, home_area: d?.home_area ?? null,
    gender: d?.gender ?? null, occupation: d?.occupation ?? null,
  };
});
