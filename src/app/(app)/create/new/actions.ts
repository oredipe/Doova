"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";
import { checkDraft, CREATOR_RULES, type Draft } from "@/lib/taskDraft";

const TIER_MAX_SLOTS = [0, 200, 1000, 5000, 5000, 5000];

/** Check the draft against the 3 Nov rules and save it as an unfunded task. */
export async function createTask(draft: Draft): Promise<{ error?: string }> {
  const me = await requireProfile();
  const slots = Math.round(Number(draft.slots));
  if (slots > TIER_MAX_SLOTS[me.creator_tier] && slots <= 5000)
    return { error: `Your creator tier can post up to ${TIER_MAX_SLOTS[me.creator_tier].toLocaleString("en-NG")} slots a task.` };
  const c = checkDraft(draft, { ...CREATOR_RULES, maxSlots: 5000 });
  if (c.error !== undefined) return { error: c.error };

  const db = createAdminClient();
  const { data, error } = await db.from("tasks").insert({
    creator_type: "user", creator_id: me.id, created_by_user_id: me.id, ...c.row,
  }).select("id").single();
  if (error || !data) return { error: "We couldn't save the task. Please try again." };
  redirect(`/create/tasks/${data.id}/fund`);
}
