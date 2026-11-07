"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseNigerianPhone } from "@/lib/phone";
import { friendlyStaffError, requireStaff } from "@/lib/staff";

const back = (q: string) => redirect(`/admin/settings?${q}`);

export async function setSwitch(key: string, on: boolean) {
  const me = await requireStaff("settings.update");
  const { error } = await createAdminClient().rpc("staff_set_switch", { p_staff: me.id, p_key: key, p_on: on });
  if (error) back(`error=${encodeURIComponent(friendlyStaffError(error.message))}`);
  revalidatePath("/admin", "layout");
  back("done=saved");
}

export async function addStaff(form: FormData) {
  const me = await requireStaff("staff.manage");
  const phone = normaliseNigerianPhone(String(form.get("phone") ?? ""));
  if (!phone) back(`error=${encodeURIComponent("Enter their Nigerian phone number, the one they use for Doova.")}`);
  const { error } = await createAdminClient().rpc("add_staff_member", {
    p_by: me.id, p_phone: phone, p_role: String(form.get("role")), p_email: String(form.get("email") ?? ""),
  });
  if (error) back(`error=${encodeURIComponent(friendlyStaffError(error.message))}`);
  revalidatePath("/admin/settings");
  back("done=added");
}

export async function setStaffActive(userId: string, active: boolean) {
  const me = await requireStaff("staff.manage");
  const { error } = await createAdminClient().rpc("staff_set_active", { p_by: me.id, p_user: userId, p_active: active });
  if (error) back(`error=${encodeURIComponent(friendlyStaffError(error.message))}`);
  revalidatePath("/admin/settings");
  back("done=saved");
}

export type AddStaffState = { error?: string; done?: { name: string; email: string; password: string } };

/** An admin-only staff account: email sign-in with a temporary password, no phone, no doer/creator app. */
export async function addAdminOnlyStaff(_prev: AddStaffState, form: FormData): Promise<AddStaffState> {
  const me = await requireStaff("staff.manage");
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "moderator");
  if (!name.includes(" ")) return { error: "Enter their first and last name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  const db = createAdminClient();
  const password = tempPassword();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, staff_only: true } });
  if (error || !data.user) {
    return { error: /already|registered|exists/i.test(error?.message ?? "") ? "That email already has a sign-in. Use a different email, or add their Doova account by phone instead." : "Couldn't create the sign-in. Please try again." };
  }
  const { error: rpcError } = await db.rpc("add_staff_only_account", { p_by: me.id, p_id: data.user.id, p_email: email, p_name: name, p_role: role });
  if (rpcError) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: friendlyStaffError(rpcError.message) };
  }
  revalidatePath("/admin/settings");
  return { done: { name, email, password } };
}

function tempPassword() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}
