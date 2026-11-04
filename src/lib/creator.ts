import "server-only";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/profile";
import type { FormSchema } from "@/lib/tasks";

/** Test mode (pilot only): lets the founder add pretend money and approve tasks without Paystack or the admin dashboard. */
export function testMode(): boolean {
  return process.env.DOOVA_TEST_MODE === "on";
}

export const PLATFORM_FEE_BPS = 1500;
/** Same rounding as the database (fund_task): 15% of the rewards, rounded up to the kobo. */
export function feeKobo(escrowKobo: number): number {
  return Math.floor((escrowKobo * PLATFORM_FEE_BPS + 9999) / 10000);
}

export type OwnTask = {
  id: string; title: string; instructions: string; kind: string; status: string; review_mode: "auto" | "manual";
  reward_kobo: number; slots: number; fee_kobo: number | null; estimated_minutes: number; attempt_minutes: number;
  auto_approve_hours: number; ends_at: string; created_at: string; funded_at: string | null; went_live_at: string | null;
  form_schema: FormSchema | null; moderation_note: string | null; moderated_at: string | null;
};

/** A task this person created. Anyone else gets a 404 (no hint that it exists). */
export async function loadOwnTask(id: string, me: Profile): Promise<OwnTask> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const { data } = await db.from("tasks")
    .select("id, title, instructions, kind, status, review_mode, reward_kobo, slots, fee_kobo, estimated_minutes, attempt_minutes, auto_approve_hours, ends_at, created_at, funded_at, went_live_at, form_schema, moderation_note, moderated_at, creator_type, creator_id")
    .eq("id", id).maybeSingle();
  if (!data || data.creator_type !== "user" || data.creator_id !== me.id) notFound();
  return data as OwnTask;
}

export async function walletBalance(meId: string): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.from("v_wallet_balances").select("balance_kobo").eq("owner_type", "user").eq("owner_id", meId).eq("purse", "funds").maybeSingle();
  return Number(data?.balance_kobo ?? 0);
}

export const TASK_STATUS: Record<string, { label: string; pill: string }> = {
  draft: { label: "Draft", pill: "c-pill c-pill-quiet" },
  pending_funding: { label: "Not funded yet", pill: "c-pill c-pill-quiet" },
  under_moderation: { label: "Being checked", pill: "c-pill c-pill-active" },
  live: { label: "Live", pill: "c-pill c-pill-lime" },
  paused: { label: "Paused", pill: "c-pill c-pill-quiet" },
  filled: { label: "All slots taken", pill: "c-pill c-pill-paid" },
  closed: { label: "Closed", pill: "c-pill c-pill-quiet" },
  settled: { label: "Finished", pill: "c-pill c-pill-quiet" },
  rejected_by_moderation: { label: "Not approved", pill: "c-pill c-pill-bad" },
};

export function friendlyCreatorError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("insufficient balance")) return "Your Creator funds don't have enough for this task yet. Add money first.";
  if (m.includes("slots a task")) return message!.replace(/^.*?:\s*/, "").replace(/^\w/, (c) => c.toUpperCase()) + ". Your tier rises as you complete tasks.";
  if (m.includes("laptop tasks")) return "Laptop tasks open at the Verified tier.";
  if (m.includes("nda tasks")) return "NDA tasks open at the Trusted tier.";
  if (m.includes("end date is in the past")) return "This task's closing date has passed. Post it again with a new date.";
  if (m.includes("cannot be funded")) return "This task is already funded.";
  if (m.includes("rejection reason")) return "Say why you're not approving this work.";
  if (m.includes("may not review")) return "You can't review this task.";
  if (m.includes("cannot be approved") || m.includes("cannot be rejected")) return "This response was already decided.";
  return "Something went wrong. Please try again.";
}

export const FLAG: Record<string, string> = { attention: "Failed the attention check", too_fast: "Finished very fast", copied: "Copied written answer" };

/** Doers are shown to creators by first name and last initial only (Privacy policy, Part B). */
export function shortName(full: string | null): string {
  const p = (full ?? "Doer").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
}
