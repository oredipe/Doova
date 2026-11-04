import "server-only";
import crypto from "node:crypto";
import { testMode } from "@/lib/creator";

// NIN check (3 Nov: NIN only, at a doer's first withdrawal). Paystack doesn't check NINs, so this uses a
// separate identity provider, chosen later (e.g. Monnify, Prembly, Dojah, QoreID). Until one is set, test
// mode accepts any 11-digit NIN and returns the person's own profile name.

export function ninCheckAvailable() {
  return Boolean(process.env.NIN_PROVIDER) || testMode();
}

/** One NIN per account, without storing the NIN: a keyed hash. NIN_HASH_SECRET must never change once set. */
export function ninHash(nin: string): string {
  const secret = process.env.NIN_HASH_SECRET ?? (testMode() ? "doova-test-mode-only" : "");
  if (!secret) throw new Error("NIN_HASH_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(nin).digest("hex");
}

export type NinResult = { ok: true; legalName: string } | { ok: false; error: string };

export async function checkNin(nin: string, profileName: string): Promise<NinResult> {
  if (!/^\d{11}$/.test(nin)) return { ok: false, error: "A NIN is 11 digits. Check your NIN slip or dial *346# to get it." };
  if (!process.env.NIN_PROVIDER) {
    if (testMode()) return { ok: true, legalName: profileName };
    return { ok: false, error: "NIN checks aren't switched on yet. Please try again later." };
  }
  return { ok: false, error: "NIN checks aren't switched on yet. Please try again later." };
}
