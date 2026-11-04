"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { feeKobo, friendlyCreatorError, loadOwnTask, testMode, walletBalance } from "@/lib/creator";

/** Lock the rewards and fee from the creator's wallet. During the pilot the task then waits for Doova's check. */
export async function fundFromWallet(taskId: string) {
  const me = await requireProfile();
  await loadOwnTask(taskId, me);
  const db = createAdminClient();
  const { data: s } = await db.from("platform_settings").select("value").eq("key", "pilot_all_tasks_need_approval").maybeSingle();
  const skip = s ? s.value === false : false;
  const { error } = await db.rpc("fund_task", { p_task: taskId, p_skip_moderation: skip });
  if (error) redirect(`/create/tasks/${taskId}/fund?error=${encodeURIComponent(friendlyCreatorError(error.message))}`);
  redirect(`/create/tasks/${taskId}?funded=1`);
}

/** TEST MODE ONLY: pretend a bank transfer arrived for exactly what's missing. */
export async function addTestMoney(taskId: string) {
  if (!testMode()) throw new Error("Test money is switched off.");
  const me = await requireProfile();
  const t = await loadOwnTask(taskId, me);
  const total = t.reward_kobo * t.slots + feeKobo(t.reward_kobo * t.slots);
  const short = total - (await walletBalance(me.id));
  if (short > 0) {
    const db = createAdminClient();
    await db.rpc("record_deposit", {
      p_provider: "paystack", p_provider_ref: `TEST-${randomUUID()}`, p_owner_type: "user", p_owner_id: me.id,
      p_channel: "bank_transfer", p_amount_kobo: short, p_fee_kobo: 0,
    });
  }
  revalidatePath(`/create/tasks/${taskId}/fund`);
  redirect(`/create/tasks/${taskId}/fund`);
}

export async function approveResponse(taskId: string, submissionId: string) {
  const me = await requireProfile();
  await loadOwnTask(taskId, me);
  const db = createAdminClient();
  const { error } = await db.rpc("approve_submission", { p_submission: submissionId, p_reviewer: me.id, p_auto: false });
  if (error) redirect(`/create/tasks/${taskId}/review/${submissionId}?error=${encodeURIComponent(friendlyCreatorError(error.message))}`);
  redirect(`/create/tasks/${taskId}/review/next?after=${submissionId}`);
}

export async function rejectResponse(taskId: string, submissionId: string, form: FormData) {
  const me = await requireProfile();
  await loadOwnTask(taskId, me);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 10) redirect(`/create/tasks/${taskId}/review/${submissionId}?error=${encodeURIComponent("Write a reason of at least 10 characters. The doer will see it and can appeal.")}`);
  const db = createAdminClient();
  const { error } = await db.rpc("reject_submission", { p_submission: submissionId, p_reviewer: me.id, p_reason: reason });
  if (error) redirect(`/create/tasks/${taskId}/review/${submissionId}?error=${encodeURIComponent(friendlyCreatorError(error.message))}`);
  redirect(`/create/tasks/${taskId}/review/next?after=${submissionId}`);
}

/** Close early: no new people can start; unused rewards come back as responses resolve. */
export async function closeTask(taskId: string) {
  const me = await requireProfile();
  await loadOwnTask(taskId, me);
  const db = createAdminClient();
  const { error } = await db.rpc("close_task", { p_task: taskId });
  if (error) redirect(`/create/tasks/${taskId}?error=${encodeURIComponent(friendlyCreatorError(error.message))}`);
  redirect(`/create/tasks/${taskId}?closed=1`);
}
