import "server-only";

// Monnify (by Moniepoint): used only for NIN lookups, ₦60 per successful request, paid from the Monnify wallet.
// Live mode only: Monnify's sandbox has no NIN lookup. Docs: developers.monnify.com (Verification API,
// POST /api/v1/vas/nin-details). Keys: MONNIFY_API_KEY and MONNIFY_SECRET_KEY (Monnify dashboard →
// Developers → API Keys & Webhooks).

const BASE = process.env.MONNIFY_API_URL ?? "https://api.monnify.com";   // override only for local tests

export function monnifyConfigured() {
  return Boolean(process.env.MONNIFY_API_KEY && process.env.MONNIFY_SECRET_KEY);
}

export class MonnifyError extends Error {
  constructor(message: string, readonly kind: "not_found" | "balance" | "auth" | "other") { super(message); }
}

type Envelope<T> = { requestSuccessful?: boolean; responseMessage?: string; responseCode?: string; responseBody?: T };

// Access tokens last about an hour; keep one per server instance and renew a minute early.
let token: { value: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const basic = Buffer.from(`${process.env.MONNIFY_API_KEY}:${process.env.MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { Authorization: `Basic ${basic}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Envelope<{ accessToken?: string; expiresIn?: number }>;
  if (!res.ok || !json.requestSuccessful || !json.responseBody?.accessToken) {
    throw new MonnifyError(json.responseMessage || `Monnify sign-in failed (${res.status})`, "auth");
  }
  token = { value: json.responseBody.accessToken, until: Date.now() + Math.max(60, (json.responseBody.expiresIn ?? 3000) - 60) * 1000 };
  return token.value;
}

export type NinDetails = { firstName: string; middleName: string; lastName: string; dateOfBirth: string | null; gender: string | null };

/** "1996-10-08", "08-10-1996" or "08/10/1996" → "1996-10-08"; anything else → null. */
export function isoDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Look up a NIN. Throws MonnifyError: kind "not_found" (no such NIN), "balance" (top up the wallet), "auth", "other". */
export async function lookupNin(nin: string): Promise<NinDetails> {
  const send = async () => fetch(`${BASE}/api/v1/vas/nin-details`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ nin }), cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  let res = await send();
  if (res.status === 401) { token = null; res = await send(); }   // token expired early
  const json = (await res.json().catch(() => ({}))) as Envelope<Record<string, unknown>>;
  const msg = json.responseMessage ?? "";
  if (!res.ok || !json.requestSuccessful || !json.responseBody) {
    if (/balance|insufficient|fund/i.test(msg)) throw new MonnifyError(msg, "balance");
    if (res.status === 401 || res.status === 403) throw new MonnifyError(msg || "Monnify refused the key", "auth");
    if (res.status === 404 || /not ?found|invalid nin|no record|does not exist/i.test(msg)) throw new MonnifyError(msg || "NIN not found", "not_found");
    throw new MonnifyError(msg || `Monnify error ${res.status}`, "other");
  }
  const b = json.responseBody;
  const str = (v: unknown) => String(v ?? "").trim();
  return {
    firstName: str(b.firstName), middleName: str(b.middleName), lastName: str(b.lastName),
    dateOfBirth: isoDate(b.dateOfBirth), gender: str(b.gender) || null,
  };
}
