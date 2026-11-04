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
