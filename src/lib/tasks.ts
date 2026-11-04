import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/profile";

// ---------- task form ----------
export type Question = {
  id: string;
  type: "single_choice" | "multi_choice" | "rating" | "short_text" | "long_text";
  label: string;
  options?: string[];
  scale?: number;
  low?: string;
  high?: string;
  min_length?: number;
  required?: boolean;
  /** Attention check: the one right answer. Never sent to the browser. */
  check?: { answer: string };
};
export type FormSchema = { questions: Question[] };
export type Answers = Record<string, string | string[]>;

/** The questions as the doer sees them: attention-check answers removed. */
export function publicQuestions(schema: FormSchema | null): Omit<Question, "check">[] {
  return (schema?.questions ?? []).map((q) => {
    const copy = { ...q };
    delete copy.check;
    return copy;
  });
}

// ---------- the task as a doer sees it ----------
export type TaskForDoer = {
  id: string;
  title: string;
  instructions: string;
  kind: string;
  status: string;
  reward_kobo: number;
  slots: number;
  estimated_minutes: number;
  attempt_minutes: number;
  auto_approve_hours: number;
  review_mode: "auto" | "manual";
  needs_laptop: boolean;
  requires_nda: boolean;
  ends_at: string;
  went_live_at: string | null;
  creator_type: "user" | "org";
  creator_id: string;
  form_schema: FormSchema | null;
};

export async function loadTask(id: string): Promise<TaskForDoer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("tasks")
    .select("id, title, instructions, kind, status, reward_kobo, slots, estimated_minutes, attempt_minutes, auto_approve_hours, review_mode, needs_laptop, requires_nda, ends_at, went_live_at, creator_type, creator_id, form_schema")
    .eq("id", id)
    .maybeSingle();
  return (data as TaskForDoer) ?? null;
}

export async function creatorSummary(task: TaskForDoer) {
  const db = createAdminClient();
  const [{ data: feed }, { data: rating }] = await Promise.all([
    db.from("v_task_feed").select("creator_name, creator_tier, slots_left").eq("id", task.id).maybeSingle(),
    db.from("v_rating_summary").select("ratings, average, show_average")
      .eq("ratee_type", task.creator_type).eq("ratee_id", task.creator_id).eq("rated_as", "creator").maybeSingle(),
  ]);
  return {
    name: (feed?.creator_name as string) ?? "A Doova creator",
    tier: (feed?.creator_tier as number) ?? 1,
    slotsLeft: (feed?.slots_left as number) ?? 0,
    rating: rating?.show_average ? Number(rating.average) : null,
    ratings: Number(rating?.ratings ?? 0),
  };
}

export const TIER_NAMES = ["", "New", "Verified", "Trusted", "Top", "Partner"];
export const LEVEL_NAMES = ["", "Starter", "Regular", "Skilled", "Pro", "Expert"];
export const LEVEL_XP = [0, 0, 100, 400, 1000, 2500];
const KIND_LEVEL: Record<string, number> = { survey: 1, review: 1, labelling: 2, app_test: 3, other: 4 };
const MAX_REWARD = [0, 150000, 300000, 500000, 1000000, Infinity];

/** Can this doer start this task? Mirrors the database rule (check_doer_level_allows), for display. */
export function eligibility(me: Profile, task: TaskForDoer) {
  const rows = [
    { ok: me.level >= (KIND_LEVEL[task.kind] ?? 1), text: `Level ${KIND_LEVEL[task.kind] ?? 1} or higher for this kind of task (you're Level ${me.level})` },
    { ok: task.reward_kobo <= MAX_REWARD[me.level], text: `Your level can do tasks paying up to ${MAX_REWARD[me.level] === Infinity ? "any amount" : "₦" + (MAX_REWARD[me.level] / 100).toLocaleString("en-NG")}` },
  ];
  if (task.needs_laptop) rows.push({ ok: me.level >= 3, text: "Laptop tasks open at Level 3" });
  if (task.requires_nda) rows.push({ ok: me.level >= 5, text: "Confidential (NDA) tasks open at Level 5" });
  const early = task.went_live_at && Date.now() < new Date(task.went_live_at).getTime() + 30 * 60_000 && me.level < 4;
  if (early) rows.push({ ok: false, text: "Pro and Expert doers see new tasks first. This one opens to you 30 minutes after it went live." });
  return { rows, ok: rows.every((r) => r.ok) };
}

// ---------- automatic checks (3 Nov): run on the server when work is submitted ----------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function validate(schema: FormSchema, answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of schema.questions) {
    const a = answers[q.id];
    const empty = a === undefined || (Array.isArray(a) ? a.length === 0 : String(a).trim() === "");
    if (q.required && empty) { errors[q.id] = "Please answer this question."; continue; }
    if (!empty && q.type === "long_text" && q.min_length && String(a).trim().length < q.min_length) {
      errors[q.id] = `Please write a little more: at least ${q.min_length} characters (you have ${String(a).trim().length}).`;
    }
    if (!empty && (q.type === "single_choice") && q.options && !q.options.includes(String(a))) errors[q.id] = "Choose one of the options.";
    if (!empty && q.type === "rating") {
      const n = Number(a);
      if (!Number.isInteger(n) || n < 1 || n > (q.scale ?? 5)) errors[q.id] = "Choose a rating.";
    }
  }
  return errors;
}

export async function runChecks(task: TaskForDoer, answers: Answers, reservedAt: string, submissionId: string) {
  const schema = task.form_schema ?? { questions: [] };
  const failed: string[] = [];
  for (const q of schema.questions) {
    if (q.check && String(answers[q.id] ?? "") !== q.check.answer) failed.push("attention");
  }
  const seconds = Math.round((Date.now() - new Date(reservedAt).getTime()) / 1000);
  if (seconds < (task.estimated_minutes * 60) / 3) failed.push("too_fast");

  const written = schema.questions.filter((q) => q.type === "long_text").map((q) => norm(String(answers[q.id] ?? ""))).filter((s) => s.length >= 20);
  if (written.length) {
    const db = createAdminClient();
    const { data } = await db.from("submissions").select("id, answers").eq("task_id", task.id).neq("id", submissionId)
      .not("answers", "is", null).limit(1000);
    const others = new Set<string>();
    for (const row of data ?? []) {
      for (const q of schema.questions.filter((x) => x.type === "long_text")) {
        const v = (row.answers as Answers | null)?.[q.id];
        if (v) others.add(norm(String(v)));
      }
    }
    if (written.some((w) => others.has(w))) failed.push("copied");
  }
  const unique = [...new Set(failed)];
  return { passed: unique.length === 0, failed: unique, seconds };
}

/** Database errors in plain words for doers. */
export function friendlyTaskError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("task is full")) return "All slots are taken right now. If someone runs out of time, a slot opens again.";
  if (m.includes("one attempt per person")) return "You've already done this task. Each person can do a task once.";
  if (m.includes("own tasks")) return "You can't do your own task.";
  if (m.includes("higher level") || m.includes("opens at") || m.includes("level")) return "This task opens at a higher level.";
  if (m.includes("30 minutes")) return "Pro and Expert doers get new tasks first. Try again in a few minutes.";
  if (m.includes("not accepting") || m.includes("outside its start")) return "This task has closed.";
  if (m.includes("time limit passed")) return "Time ran out on this task, so the slot was released.";
  if (m.includes("not active")) return "Your account is paused. Contact support.";
  return "Something went wrong. Please try again.";
}
