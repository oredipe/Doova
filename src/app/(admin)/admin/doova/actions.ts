"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyStaffError, requireStaff } from "@/lib/staff";
import { checkDraft, DOOVA_RULES, type Draft } from "@/lib/taskDraft";
import { DOOVA_ORG, loadDoovaTask, nairaToKobo } from "@/lib/doova";
import { testMode } from "@/lib/creator";
import { kickPush } from "@/lib/push";

const back = (path: string, key: "done" | "error", v: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(v)}`);

/** Owners: save the task and launch it from the budget in one go. If launching fails, nothing is left behind. */
export async function createDoovaTask(draft: Draft): Promise<{ error?: string }> {
  kickPush();
  const me = await requireStaff("settings.update");
  const c = checkDraft(draft, DOOVA_RULES);
  if (c.error !== undefined) return { error: c.error };
  const db = createAdminClient();
  const { data, error } = await db.from("tasks").insert({
    creator_type: "org", creator_id: DOOVA_ORG, created_by_user_id: me.id, ...c.row,
  }).select("id").single();
  if (error || !data) return { error: "We couldn't save the task. Please try again." };
  const { error: launch } = await db.rpc("staff_launch_doova_task", { p_staff: me.id, p_task: data.id });
  if (launch) {
    await db.from("tasks").delete().eq("id", data.id).eq("status", "pending_funding");
    return { error: friendlyStaffError(launch.message.replace(/short by (\d+) kobo/, (_, k) => `short by ₦${(Number(k) / 100).toLocaleString("en-NG")}`)) };
  }
  redirect(`/admin/doova/${data.id}?done=launched`);
}

// ---------- the budget (owners) ----------
export async function budgetFromFees(form: FormData) {
  const me = await requireStaff("settings.update");
  const kobo = nairaToKobo(form.get("amount"));
  if (!(kobo > 0)) back("/admin/doova", "error", "Enter an amount.");
  const { error } = await createAdminClient().rpc("staff_budget_from_fees", { p_staff: me.id, p_amount_kobo: kobo });
  if (error) back("/admin/doova", "error", friendlyStaffError(error.message.replace(/only (\d+) kobo/, (_, k) => `only ₦${(Number(k) / 100).toLocaleString("en-NG")}`)));
  back("/admin/doova", "done", "fees");
}

export async function budgetRecordTransfer(form: FormData) {
  const me = await requireStaff("settings.update");
  const kobo = nairaToKobo(form.get("amount"));
  const ref = String(form.get("reference") ?? "").trim().slice(0, 80);
  if (!(kobo > 0)) back("/admin/doova", "error", "Enter the amount that arrived.");
  if (!ref) back("/admin/doova", "error", "Enter the transfer reference from the Paystack dashboard.");
  const db = createAdminClient();
  const { data: seen } = await db.from("payments").select("id").eq("provider", "paystack").eq("provider_ref", `DOOVA-${ref}`).maybeSingle();
  if (seen) back("/admin/doova", "error", "That reference was already recorded, so it wasn't added again.");
  const { error } = await db.rpc("staff_budget_record_transfer", { p_staff: me.id, p_reference: ref, p_amount_kobo: kobo });
  if (error) back("/admin/doova", "error", friendlyStaffError(error.message));
  back("/admin/doova", "done", "transfer");
}

/** TEST MODE ONLY: pretend company money arrived. */
export async function budgetTestMoney(form: FormData) {
  const me = await requireStaff("settings.update");
  if (!testMode()) back("/admin/doova", "error", "Test money is switched off.");
  const kobo = nairaToKobo(form.get("amount"));
  if (!(kobo > 0)) back("/admin/doova", "error", "Enter an amount.");
  const { error } = await createAdminClient().rpc("staff_budget_record_transfer", { p_staff: me.id, p_reference: `TEST-${randomUUID()}`, p_amount_kobo: kobo });
  if (error) back("/admin/doova", "error", friendlyStaffError(error.message));
  back("/admin/doova", "done", "test");
}

// ---------- reviewing and closing ----------
export async function approveDoovaResponse(taskId: string, subId: string) {
  kickPush();
  const me = await requireStaff("task.moderate");
  await loadDoovaTask(taskId);
  const db = createAdminClient();
  const { error } = await db.rpc("approve_submission", { p_submission: subId, p_reviewer: me.id, p_auto: false });
  if (error) back(`/admin/doova/${taskId}/review/${subId}`, "error", friendlyStaffError(error.message));
  await db.rpc("log_staff_action", { p_staff: me.id, p_action: "doova_task.approve", p_target_type: "submission", p_target_id: subId, p_detail: { task: taskId } });
  redirect(`/admin/doova/${taskId}/review/next?after=${subId}`);
}

export async function rejectDoovaResponse(taskId: string, subId: string, form: FormData) {
  kickPush();
  const me = await requireStaff("task.moderate");
  await loadDoovaTask(taskId);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 10) back(`/admin/doova/${taskId}/review/${subId}`, "error", "Write a reason of at least 10 characters. The doer will see it and can appeal.");
  const db = createAdminClient();
  const { error } = await db.rpc("reject_submission", { p_submission: subId, p_reviewer: me.id, p_reason: reason });
  if (error) back(`/admin/doova/${taskId}/review/${subId}`, "error", friendlyStaffError(error.message));
  await db.rpc("log_staff_action", { p_staff: me.id, p_action: "doova_task.reject", p_target_type: "submission", p_target_id: subId, p_detail: { task: taskId, reason } });
  redirect(`/admin/doova/${taskId}/review/next?after=${subId}`);
}

export async function closeDoovaTask(taskId: string) {
  kickPush();
  const me = await requireStaff("settings.update");
  const { error } = await createAdminClient().rpc("staff_close_doova_task", { p_staff: me.id, p_task: taskId });
  if (error) back(`/admin/doova/${taskId}`, "error", friendlyStaffError(error.message));
  back(`/admin/doova/${taskId}`, "done", "closed");
}
