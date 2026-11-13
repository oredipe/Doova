import "server-only";
import crypto from "node:crypto";
import { testMode } from "@/lib/creator";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageFrom } from "@/lib/details";
import { lookupNin, monnifyConfigured, MonnifyError } from "@/lib/monnify";

// NIN check (once, at a doer's first withdrawal). Paystack doesn't check NINs, so this uses Monnify
// (NIN_PROVIDER=monnify, 13 Nov 2026). The NIN's name must match the Doova name, and its date of birth must
// match the one given at sign-up (and be 18+). Nothing from the NIN record is shown back to the person, so a
// stranger's NIN can't be used to look someone up. Every attempt is logged; at most 3 tries a day.
// Until a provider is set, test mode accepts any 11-digit NIN and returns the person's own profile name.

export const DAILY_TRIES = 3;

function provider(): "monnify" | null {
  return process.env.NIN_PROVIDER === "monnify" && monnifyConfigured() ? "monnify" : null;
}

export function ninCheckAvailable() {
  return provider() !== null || testMode();
}

/** One NIN per account, without storing the NIN: a keyed hash. NIN_HASH_SECRET must never change once set. */
export function ninHash(nin: string): string {
  const secret = process.env.NIN_HASH_SECRET ?? (testMode() ? "doova-test-mode-only" : "");
  if (!secret) throw new Error("NIN_HASH_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(nin).digest("hex");
}

/**
 * Same rule as names_match() in the database (bank accounts): every word of the shorter name is in the longer
 * one, ignoring case, punctuation and order; an initial matches a word's first letter; at least two full names
 * in common ("ADEBAYO KEMI A" matches "Kemi Adebayo").
 */
export function namesMatch(x: string, y: string): boolean {
  const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean);
  const a = words(x), b = words(y);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let full = 0;
  for (const w of short) {
    if (w.length === 1) { if (!long.some((l) => l[0] === w)) return false; }
    else { if (!long.includes(w)) return false; full++; }
  }
  return full >= Math.min(2, long.length);
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());

type Outcome = "passed" | "name_mismatch" | "dob_mismatch" | "under_18" | "not_found" | "duplicate" | "error";

/** Log an attempt (never the NIN or what it returned). */
export async function logNinCheck(userId: string, outcome: Outcome, charged: boolean, detail?: string) {
  const { error } = await createAdminClient().from("nin_checks").insert({ user_id: userId, provider: provider() ?? "test", outcome, charged, detail: detail?.slice(0, 200) ?? null });
  if (error) console.error("nin_checks log:", error.message);
}

async function triesToday(userId: string): Promise<number | null> {
  const { count, error } = await createAdminClient().from("nin_checks").select("id", { count: "exact", head: true })
    .eq("user_id", userId).neq("outcome", "error").gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return error ? null : count ?? 0;
}

export type NinResult = { ok: true; legalName: string; dob: string | null } | { ok: false; error: string };

export async function checkNin(nin: string, me: { id: string; name: string; dob: string | null }): Promise<NinResult> {
  if (!/^\d{11}$/.test(nin)) return { ok: false, error: "A NIN is 11 digits. Check your NIN slip or dial *346# to get it." };
  const p = provider();
  if (!p) {
    if (testMode()) return { ok: true, legalName: me.name, dob: null };
    return { ok: false, error: "NIN checks aren’t switched on yet. Please try again later." };
  }

  // Each lookup costs money and could be used to test other people's NINs: 3 tries a day.
  const tries = await triesToday(me.id);
  if (tries === null) return { ok: false, error: "NIN checks aren’t switched on yet. Please try again later." };   // database update not run
  if (tries >= DAILY_TRIES) return { ok: false, error: `You’ve tried ${DAILY_TRIES} times today. Please try again tomorrow, or email hello@getdoova.com and we’ll help.` };

  let d;
  try {
    d = await lookupNin(nin);
  } catch (e) {
    const kind = e instanceof MonnifyError ? e.kind : "other";
    console.error("NIN lookup failed:", kind, e instanceof Error ? e.message : e);
    if (kind === "not_found") {
      await logNinCheck(me.id, "not_found", false);
      return { ok: false, error: "We couldn’t find that NIN. Check the 11 digits on your NIN slip, or dial *346# from the phone line linked to it." };
    }
    await logNinCheck(me.id, "error", false, kind);   // errors on our side don't count towards the 3 tries
    return { ok: false, error: "We couldn’t check NINs just now. Your money is safe; please try again in a few hours." };
  }

  const ninName = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(" ");
  if (!ninName) {
    await logNinCheck(me.id, "error", true, "no name returned");
    return { ok: false, error: "We couldn’t read the details for that NIN. Please email hello@getdoova.com and we’ll help." };
  }
  if (!namesMatch(ninName, me.name)) {
    await logNinCheck(me.id, "name_mismatch", true);
    return { ok: false, error: "The name on this NIN doesn’t match the name on your Doova account. Check you typed your own NIN. If your Doova name is spelt differently from your NIN, email hello@getdoova.com and we’ll fix it." };
  }
  if (d.dateOfBirth && ageFrom(d.dateOfBirth) < 18) {
    await logNinCheck(me.id, "under_18", true);
    await createAdminClient().from("users").update({ is_flagged: true }).eq("id", me.id);
    return { ok: false, error: "Doova is only for people aged 18 and over, so we can’t pay out to this account. Email hello@getdoova.com if you think this is wrong." };
  }
  if (d.dateOfBirth && me.dob && d.dateOfBirth !== me.dob) {
    await logNinCheck(me.id, "dob_mismatch", true);
    return { ok: false, error: "The date of birth on this NIN doesn’t match the one on your Doova account. Email hello@getdoova.com and we’ll help you sort it out." };
  }
  // "passed" is logged by the caller once the result is saved (it can still fail as a duplicate NIN).
  return { ok: true, legalName: title(ninName), dob: d.dateOfBirth };
}
