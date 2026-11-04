import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { naira, requireProfile } from "@/lib/profile";
import { loadTask, publicQuestions } from "@/lib/tasks";
import { leaveTask } from "../actions";
import { TaskForm } from "./TaskForm";

export const metadata: Metadata = { title: "Doing a task" };

export default async function DoTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const task = await loadTask(id);
  if (!task) notFound();
  const db = createAdminClient();
  const { data: sub } = await db.from("submissions").select("status, reserved_until").eq("task_id", id).eq("doer_id", me.id).maybeSingle();
  if (!sub) redirect(`/tasks/${id}`);
  if (sub.status !== "reserved") redirect(`/tasks/${id}/done`);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="c-small">{naira(task.reward_kobo)} · about {task.estimated_minutes} min</span>
        <h1 className="c-h1">{task.title}</h1>
        <p className="c-sub">{task.instructions}</p>
      </div>
      <TaskForm taskId={id} questions={publicQuestions(task.form_schema)} until={sub.reserved_until} />
      <form action={leaveTask.bind(null, id)} style={{ textAlign: "center" }}>
        <button className="c-link" style={{ color: "var(--c-muted)" }}>Leave this task and free the slot</button>
      </form>
    </>
  );
}
