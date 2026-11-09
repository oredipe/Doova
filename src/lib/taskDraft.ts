import type { Question } from "@/lib/tasks";

// The task builder's draft and its rules, shared by creators (3 Nov rules) and Doova's own tasks
// (9 Nov: no minimum reward or slots, no fee). The database checks the limits again.

export type Draft = {
  kind: "survey" | "review" | "labelling";
  title: string;
  instructions: string;
  questions: Question[];
  estimatedMinutes: number;
  attemptMinutes: number;
  rewardNaira: number;
  slots: number;
  reviewMode: "auto" | "manual";
  reviewHours: number;
  closesInDays: number;
};

export type DraftRules = { minReward: number; maxReward: number; minSlots: number; maxSlots: number };
export const CREATOR_RULES: Omit<DraftRules, "maxSlots"> = { minReward: 500, maxReward: 500000, minSlots: 5 };
export const DOOVA_RULES: DraftRules = { minReward: 0, maxReward: 500000, minSlots: 1, maxSlots: 100000 };

const int = (v: unknown) => (v === "" || v == null ? NaN : Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);
const n = (v: number) => v.toLocaleString("en-NG");

/** The insert fields for a valid draft, or a plain-words error. */
export function checkDraft(d: Draft, r: DraftRules):
  | { error: string }
  | { error?: undefined; row: Record<string, unknown> } {
  const title = String(d.title ?? "").trim();
  const instructions = String(d.instructions ?? "").trim();
  const est = int(d.estimatedMinutes), attempt = int(d.attemptMinutes), reward = int(d.rewardNaira), slots = int(d.slots);
  const hours = int(d.reviewHours), days = int(d.closesInDays);

  if (!["survey", "review", "labelling"].includes(d.kind)) return { error: "Choose what kind of task this is." };
  if (title.length < 5 || title.length > 80) return { error: "Give the task a title of 5 to 80 characters." };
  if (instructions.length < 20 || instructions.length > 1000) return { error: "Write instructions of 20 to 1,000 characters." };
  if (!(est >= 1 && est <= 180)) return { error: "The time a task takes must be 1 to 180 minutes." };
  if (!(attempt >= Math.max(15, 2 * est) && attempt <= 1440)) return { error: `Give people at least ${Math.max(15, 2 * est)} minutes to finish.` };
  if (!(reward >= r.minReward && reward <= r.maxReward)) return { error: `The reward must be ₦${n(r.minReward)} to ₦${n(r.maxReward)} for each person.` };
  if (!(slots >= r.minSlots && slots <= r.maxSlots)) return { error: `Choose ${n(r.minSlots)} to ${n(r.maxSlots)} slots.` };
  if (!["auto", "manual"].includes(d.reviewMode)) return { error: "Choose how responses are checked." };
  if (!(hours >= 1 && hours <= 72)) return { error: "The review window must be 1 to 72 hours." };
  if (![3, 7, 14, 30].includes(days)) return { error: "Choose when the task closes." };

  const qs = Array.isArray(d.questions) ? d.questions : [];
  if (qs.length < 1 || qs.length > 40) return { error: "Add 1 to 40 questions." };
  const questions: Question[] = [];
  for (const [i, q] of qs.entries()) {
    const label = String(q.label ?? "").trim();
    if (label.length < 3) return { error: `Question ${i + 1} needs some words.` };
    const type = q.type;
    if (!["single_choice", "multi_choice", "rating", "short_text", "long_text"].includes(type)) return { error: `Question ${i + 1} has an unknown type.` };
    const out: Question = { id: `q${i + 1}`, type, label: label.slice(0, 300), required: q.required !== false };
    if (type === "single_choice" || type === "multi_choice") {
      const options = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 12);
      if (options.length < 2) return { error: `Question ${i + 1} needs at least 2 options.` };
      if (new Set(options).size !== options.length) return { error: `Question ${i + 1} has the same option twice.` };
      out.options = options.map((o) => o.slice(0, 120));
      if (type === "single_choice" && q.check?.answer) {
        if (!options.includes(q.check.answer)) return { error: `Pick the right answer for the attention check in question ${i + 1}.` };
        out.check = { answer: q.check.answer };
      }
    }
    if (type === "rating") { out.scale = 5; if (q.low) out.low = String(q.low).slice(0, 40); if (q.high) out.high = String(q.high).slice(0, 40); }
    if (type === "long_text") out.min_length = Math.min(Math.max(int(q.min_length) || 0, 0), 1000) || undefined;
    questions.push(out);
  }

  return {
    row: {
      title, instructions, kind: d.kind,
      category: d.reviewMode === "auto" ? "native" : "proof_based", proof_type: "form", review_mode: d.reviewMode,
      reward_kobo: reward * 100, slots, estimated_minutes: est, attempt_minutes: attempt, auto_approve_hours: hours,
      ends_at: new Date(Date.now() + days * 86400_000).toISOString(), status: "pending_funding",
      form_schema: { questions },
    },
  };
}
