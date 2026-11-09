import "server-only";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormSchema } from "@/lib/tasks";

// Doova's own tasks (9 Nov): posted from admin by owners, paid from the Doova budget, no fee,
// no minimum reward or slots. Shown to doers as "From Doova".

export const DOOVA_ORG = "00000000-0000-4000-8000-00000000d00a";

export type DoovaTask = {
  id: string; title: string; instructions: string; kind: string; status: string; review_mode: "auto" | "manual";
  reward_kobo: number; slots: number; estimated_minutes: number; attempt_minutes: number; auto_approve_hours: number;
  ends_at: string; created_at: string; went_live_at: string | null; form_schema: FormSchema | null; created_by_user_id: string | null;
};

export async function loadDoovaTask(id: string): Promise<DoovaTask> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await createAdminClient().from("tasks")
    .select("id, title, instructions, kind, status, review_mode, reward_kobo, slots, estimated_minutes, attempt_minutes, auto_approve_hours, ends_at, created_at, went_live_at, form_schema, created_by_user_id, is_doova")
    .eq("id", id).maybeSingle();
  if (!data || !data.is_doova) notFound();
  return data as DoovaTask;
}

/** What's in the budget now, and how much of Doova's earned fees could be moved into it. */
export async function budgetNumbers() {
  const db = createAdminClient();
  const [{ data: acct }, { data: totals }, { data: xp }] = await Promise.all([
    db.from("ledger_accounts").select("balance_kobo").eq("type", "user_wallet").eq("owner_type", "org").eq("owner_id", DOOVA_ORG).maybeSingle(),
    db.from("v_money_totals").select("bucket, balance_kobo").in("bucket", ["platform_revenue", "processor_fees"]),
    db.from("platform_settings").select("value").eq("key", "xp_unpaid_task").maybeSingle(),
  ]);
  const t = Object.fromEntries((totals ?? []).map((r) => [r.bucket as string, Number(r.balance_kobo)]));
  return {
    budgetKobo: Number(acct?.balance_kobo ?? 0),
    feesFreeKobo: Math.max(0, (t.platform_revenue ?? 0) - (t.processor_fees ?? 0)),
    unpaidXp: Number(xp?.value ?? 10),
  };
}

/** "12,500" or "₦12,500.50" → kobo. NaN when it isn't a number. */
export function nairaToKobo(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n * 100) : NaN;
}
