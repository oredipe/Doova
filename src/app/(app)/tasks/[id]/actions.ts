"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { friendlyTaskError, loadTask, runChecks, validate, type Answers } from "@/lib/tasks";

/** "Start task": hold a slot for this doer (the database prevents over-booking). */
export async function startTask(taskId: string) {
  const me = await requireProfile();
  const db = createAdminClient();
  const { error } = await db.rpc("reserve_slot", { p_task: taskId, p_doer: me.id });
  if (error) redirect(`/tasks/${taskId}?error=${encodeURIComponent(friendlyTaskError(error.message))}`);
  redirect(`/tasks/${taskId}/do`);
}

export type SubmitState = { errors?: Record<string, string>; message?: string };

/** Submit answers: validate, run the automatic checks, then hand to the database workflow. */
export async function submitAnswers(taskId: string, _prev: SubmitState, form: FormData): Promise<SubmitState> {
  const me = await requireProfile();
  const task = await loadTask(taskId);
  if (!task?.form_schema) return { message: "This task can't be found." };

  const db = createAdminClient();
  const { data: sub } = await db.from("submissions").select("id, status, reserved_at, reserved_until")
    .eq("task_id", taskId).eq("doer_id", me.id).maybeSingle();
  if (!sub || sub.status !== "reserved") redirect(`/tasks/${taskId}/done`);

  const answers: Answers = {};
  for (const q of task.form_schema.questions) {
    if (q.type === "multi_choice") {
      answers[q.id] = form.getAll(q.id).map(String).filter((v) => q.options?.includes(v));
    } else {
      const v = form.get(q.id);
      if (v !== null) answers[q.id] = String(v).trim().slice(0, 5000);
    }
  }
  const errors = validate(task.form_schema, answers);
  if (Object.keys(errors).length) return { errors, message: "Some answers need another look." };

  const checks = await runChecks(task, answers, sub.reserved_at, sub.id);
  const { error } = await db.rpc("submit_submission", {
    p_submission: sub.id, p_doer: me.id, p_answers: answers, p_score: null,
    p_passed_checks: checks.passed, p_checks: checks,
  });
  if (error) {
    if (error.message.includes("time limit")) redirect(`/tasks/${taskId}/done`);
    return { message: friendlyTaskError(error.message) };
  }
  redirect(`/tasks/${taskId}/done`);
}

/** Give up a held slot so someone else can take it. */
export async function leaveTask(taskId: string) {
  const me = await requireProfile();
  const db = createAdminClient();
  await db.rpc("withdraw_reservation", { p_task: taskId, p_doer: me.id });
  redirect(`/tasks/${taskId}`);
}
