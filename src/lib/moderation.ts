import "server-only";
import type { FormSchema } from "@/lib/tasks";

// Automatic checks shown to staff before a task goes live (4 Nov). They only flag; staff decide.

export type Check = { ok: boolean; warn?: boolean; title: string; detail: string; matches?: string[] };
// warn: worth a look but not against the rules (shown grey, not red).

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|ng|net|org|io|co|ly|me|app|link|xyz|info|biz)(?:\/\S*)?\b|\bwa\.me\/\S*/gi;
const PERSONAL = /\b(?:\+?234|0)[789][01]\d{8}\b|\b(?:bvn|nin|password|passcode|pin|otp|atm card|card number|cvv|account number|bank details|home address)\b|\b(?:send|transfer|pay)\s+(?:me|us|money|₦|n\d)/gi;
const NOT_ALLOWED = /\b(?:bet(?:ting)?|casino|gambl\w*|sportybet|bet9ja|porn\w*|sex\w*|nude\w*|adult content|vote for|election|political party|apc|pdp|labour party|crypto investment|forex signal|ponzi|loan app|5[- ]star review|leave a review on|google review|fake review|follow (?:us|our page)|like (?:our|my) page|subscribe to (?:our|my) channel)\b/gi;

function found(re: RegExp, text: string) {
  return [...new Set((text.match(re) ?? []).map((m) => m.trim()))];
}

export function taskText(t: { title: string; instructions: string; form_schema: FormSchema | null }) {
  const qs = (t.form_schema?.questions ?? []).flatMap((q) => [q.label, ...(q.options ?? []), q.low ?? "", q.high ?? ""]);
  return [t.title, t.instructions, ...qs].join("\n");
}

export function runModerationChecks(t: { title: string; instructions: string; reward_kobo: number; estimated_minutes: number; form_schema: FormSchema | null }): Check[] {
  const text = taskText(t);
  const links = found(LINK, text);
  const personal = found(PERSONAL, text);
  const banned = found(NOT_ALLOWED, text);
  const perMin = t.reward_kobo / 100 / Math.max(1, t.estimated_minutes);
  const checks = (t.form_schema?.questions ?? []).filter((q) => q.check);
  return [
    { ok: links.length === 0, title: links.length ? "Link outside Doova" : "No links outside Doova",
      detail: links.length ? `${links.join(", ")}. Doers must never be sent off Doova; ask for files as an upload instead.` : "Nothing sends doers to another site.", matches: links },
    { ok: perMin >= 50, warn: true, title: perMin >= 50 ? "Reward fits the time" : "Reward is low for the time",
      detail: `₦${(t.reward_kobo / 100).toLocaleString("en-NG")} for about ${t.estimated_minutes} min (₦${Math.round(perMin)} a minute; we look for ₦50 or more).` },
    { ok: personal.length === 0, title: personal.length ? "Asks for personal or payment details" : "No personal or payment requests",
      detail: personal.length ? `Found: ${personal.join(", ")}.` : "No phone numbers, BVN, passwords or payments asked for.", matches: personal },
    { ok: checks.length > 0, warn: true, title: checks.length ? "Attention check included" : "No attention check",
      detail: checks.length ? `Question ${(t.form_schema?.questions ?? []).findIndex((q) => q.check) + 1}.` : "Without one, careless answers are harder to catch. Not required." },
    { ok: banned.length === 0, title: banned.length ? "On the not-allowed list" : "Nothing on the not-allowed list",
      detail: banned.length ? `Found: ${banned.join(", ")}.` : "No gambling, adult, political or fake-review content.", matches: banned },
  ];
}

/** Text with flagged words wrapped, for showing the task as doers will see it. */
export function highlight(text: string, words: string[]): (string | { flag: string })[] {
  if (!words.length) return [text];
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  return text.split(re).filter(Boolean).map((part) => (esc.some((w) => new RegExp(`^${w}$`, "i").test(part)) ? { flag: part } : part));
}

export const MODERATION_REASONS = [
  "Link outside Doova",
  "Asks for personal details",
  "Reward too low for the time",
  "Unclear instructions",
  "Not allowed on Doova",
];
