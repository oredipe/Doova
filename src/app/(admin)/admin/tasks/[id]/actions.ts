"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyStaffError, requireStaff } from "@/lib/staff";

export async function decideTask(id: string, form: FormData) {
  const me = await requireStaff("task.moderate");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (decision !== "approve" && decision !== "reject") redirect(`/admin/tasks/${id}?error=${encodeURIComponent("Choose approve or turn down.")}`);
  if (decision === "reject" && note.length < 5) redirect(`/admin/tasks/${id}?error=${encodeURIComponent("Write a note for the creator saying why.")}`);
  const { error } = await createAdminClient().rpc("staff_moderate_task", {
    p_staff: me.id, p_task: id, p_approve: decision === "approve", p_note: note || null,
  });
  if (error) redirect(`/admin/tasks/${id}?error=${encodeURIComponent(friendlyStaffError(error.message))}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/tasks?done=${decision === "approve" ? "approved" : "rejected"}`);
}
