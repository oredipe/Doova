import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/server";

// Doova staff (4 Nov): Owner, Moderator, Finance, Support. Staff sign in with email, password and
// an authenticator app; admin pages need that second step (Supabase "aal2"). Every action is
// logged by name in the database (staff_* functions).

export type StaffRole = "owner" | "moderator" | "finance" | "support";
export type Staff = { id: string; name: string; email: string; role: StaffRole; mustChangePassword: boolean; adminOnly: boolean };

export const ROLE_NAMES: Record<StaffRole, string> = { owner: "Owner", moderator: "Moderator", finance: "Finance", support: "Support" };

// Mirrors the database's staff_can() for showing and hiding things. The database still decides.
const CAN: Record<StaffRole, string[]> = {
  owner: ["*"],
  moderator: ["task.moderate", "appeal.decide", "user.suspend", "user.view"],
  finance: ["reconcile", "payout.retry", "user.view", "money.view"],
  support: ["user.view"],
};
export function can(role: StaffRole, action: string) {
  return CAN[role].includes("*") || CAN[role].includes(action);
}

/** The signed-in staff member, or null. Does not check the second step. */
export const getStaffRow = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db.from("staff_members").select("user_id, role, email, active, must_change_password, users!staff_members_user_id_fkey(full_name, staff_only)")
    .eq("user_id", user.id).eq("active", true).maybeSingle();
  if (!data) return { user, staff: null };
  const u = data.users as unknown as { full_name: string | null; staff_only: boolean } | null;
  const staff: Staff = { id: data.user_id, role: data.role as StaffRole, email: data.email as string,
    name: u?.full_name ?? "Staff", mustChangePassword: Boolean(data.must_change_password), adminOnly: Boolean(u?.staff_only) };
  return { user, staff };
});

/**
 * For every admin page and action. Not signed in → admin sign-in. Signed in but not staff → 404
 * (the admin area doesn't admit it exists). Staff without the authenticator step → verify.
 * With an action, staff whose role can't do it get a 404 too.
 */
export async function requireStaff(action?: string): Promise<Staff> {
  const row = await getStaffRow();
  if (!row) redirect("/admin/sign-in");
  if (!row.staff) notFound();
  if (row.user.aal !== "aal2") redirect("/admin/verify");
  if (row.staff.mustChangePassword) redirect("/admin/password");
  if (action && !can(row.staff.role, action)) notFound();
  return row.staff;
}

/** True when the staff member posted the task (or belongs to the business that did), or did the work. */
export async function hasConflict(staffId: string, taskId: string, doerId?: string): Promise<boolean> {
  const { data } = await createAdminClient().rpc("staff_conflict", { p_staff: staffId, p_task: taskId, p_doer: doerId ?? null });
  return Boolean(data);
}

/** Database errors in plain words for staff. */
export function friendlyStaffError(message: string | undefined): string {
  const m = (message ?? "").replace(/^.*?ERROR:\s*/, "");
  if (!m) return "Something went wrong. Please try again.";
  return m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".");
}

export const lagosDate = (iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) =>
  new Intl.DateTimeFormat("en-NG", { ...opts, timeZone: "Africa/Lagos" }).format(new Date(iso));

/** "2 h 10 min", "18 min", "3 days" */
export function ago(fromMs: number, nowMs: number) {
  const min = Math.max(0, Math.round((nowMs - fromMs) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.round(min / 1440)} days`;
}

/** Midnight today in Lagos (UTC+1, no daylight saving), as an ISO string. */
export function lagosDayStart(nowMs: number, daysAgo = 0) {
  const d = new Date(nowMs + 3600_000 - daysAgo * 86400_000).toISOString().slice(0, 10);
  return `${d}T00:00:00+01:00`;
}
export function lagosToday(nowMs: number) {
  return new Date(nowMs + 3600_000).toISOString().slice(0, 10);
}
