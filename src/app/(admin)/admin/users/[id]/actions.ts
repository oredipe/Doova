"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyStaffError, requireStaff } from "@/lib/staff";

export async function setSuspended(id: string, suspend: boolean, form: FormData) {
  const me = await requireStaff("user.suspend");
  const note = String(form.get("note") ?? "").trim();
  const { error } = await createAdminClient().rpc("staff_set_user_status", { p_staff: me.id, p_user: id, p_suspend: suspend, p_note: note });
  if (error) redirect(`/admin/users/${id}?error=${encodeURIComponent(friendlyStaffError(error.message))}`);
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?done=${suspend ? "suspended" : "restored"}`);
}
