"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyStaffError, requireStaff } from "@/lib/staff";
import { kickPush } from "@/lib/push";

export async function decideAppeal(id: string, form: FormData) {
  kickPush();
  const me = await requireStaff("appeal.decide");
  const forDoer = form.get("decision") === "doer";
  const note = String(form.get("note") ?? "").trim();
  if (note.length < 10) redirect(`/admin/disputes/${id}?error=${encodeURIComponent("Write the reason both sides will see (at least 10 characters).")}`);
  const { error } = await createAdminClient().rpc("staff_decide_appeal", { p_staff: me.id, p_appeal: id, p_for_doer: forDoer, p_note: note });
  if (error) redirect(`/admin/disputes/${id}?error=${encodeURIComponent(friendlyStaffError(error.message))}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/disputes?done=${forDoer ? "doer" : "creator"}`);
}
