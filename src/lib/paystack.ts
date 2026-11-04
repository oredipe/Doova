import "server-only";
import crypto from "node:crypto";

// Paystack (Titan-Paystack): creator account numbers, bank lookups and transfers out.
// With no PAYSTACK_SECRET_KEY, a built-in stand-in is used (test mode only) so the flows can be tried.
// Docs: paystack.com/docs (dedicated virtual accounts, transfers, webhooks).

const BASE = process.env.PAYSTACK_API_URL ?? "https://api.paystack.co";   // override only for local tests

export function paystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}
/** Test keys start sk_test_; live keys sk_live_. */
export function paystackLive() {
  return (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_live_");
}

class PaystackError extends Error {}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) throw new PaystackError(json.message || `Paystack error ${res.status}`);
  return json.data as T;
}

// ---------- banks ----------
export type Bank = { code: string; name: string };
// Used when Paystack isn't connected (test mode). Codes are Paystack's.
const FALLBACK_BANKS: Bank[] = [
  ["044", "Access Bank"], ["023", "Citibank Nigeria"], ["050", "Ecobank Nigeria"], ["070", "Fidelity Bank"],
  ["011", "First Bank of Nigeria"], ["214", "First City Monument Bank"], ["058", "Guaranty Trust Bank"],
  ["082", "Keystone Bank"], ["50211", "Kuda Bank"], ["50515", "Moniepoint MFB"], ["999992", "OPay Digital Services (OPay)"],
  ["999991", "PalmPay"], ["076", "Polaris Bank"], ["221", "Stanbic IBTC Bank"], ["232", "Sterling Bank"],
  ["032", "Union Bank of Nigeria"], ["033", "United Bank For Africa"], ["035", "Wema Bank"], ["057", "Zenith Bank"],
].map(([code, name]) => ({ code, name }));

export async function listBanks(): Promise<Bank[]> {
  if (!paystackConfigured()) return FALLBACK_BANKS;
  try {
    const data = await call<{ code: string; name: string; active: boolean }[]>("/bank?country=nigeria&currency=NGN&perPage=200");
    const banks = data.filter((b) => b.active !== false).map((b) => ({ code: b.code, name: b.name }));
    return banks.length ? banks.sort((a, b) => a.name.localeCompare(b.name)) : FALLBACK_BANKS;
  } catch {
    return FALLBACK_BANKS;
  }
}

/** The name on a bank account. Stand-in: echoes the name we expect, so test accounts always match. */
export async function resolveAccount(accountNumber: string, bankCode: string, expectedName: string): Promise<string> {
  if (!paystackConfigured()) return expectedName.toUpperCase();
  const d = await call<{ account_name: string }>(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  return d.account_name;
}

export async function createRecipient(name: string, accountNumber: string, bankCode: string): Promise<string> {
  if (!paystackConfigured()) return `RCP_test_${accountNumber}`;
  const d = await call<{ recipient_code: string }>("/transferrecipient", {
    method: "POST", body: { type: "nuban", name, account_number: accountNumber, bank_code: bankCode, currency: "NGN" },
  });
  return d.recipient_code;
}

// ---------- transfers out ----------
export type TransferResult = { transferCode: string; status: string };

/** Sends money from Doova's Paystack balance. The payout id is the reference, so a retry never pays twice. */
export async function sendTransfer(payoutId: string, amountKobo: number, recipientCode: string, reason: string): Promise<TransferResult> {
  if (!paystackConfigured()) return { transferCode: `TRF_test_${payoutId.slice(0, 8)}`, status: "success" };
  const d = await call<{ transfer_code: string; status: string }>("/transfer", {
    method: "POST", body: { source: "balance", amount: amountKobo, recipient: recipientCode, reference: payoutId, reason },
  });
  return { transferCode: d.transfer_code, status: d.status };
}

export async function verifyTransfer(reference: string) {
  return call<{ status: string; transfer_code: string; fee_charged?: number; reason?: string; gateway_response?: string }>(`/transfer/verify/${encodeURIComponent(reference)}`);
}

// ---------- money in: creator account numbers ----------
export type DedicatedAccount = { bank: string; accountNumber: string; accountName: string; customerCode: string };

export async function createDedicatedAccount(p: { userId: string; firstName: string; lastName: string; phone: string; email: string }): Promise<DedicatedAccount> {
  if (!paystackConfigured()) throw new PaystackError("Paystack isn't connected yet");
  const customer = await call<{ customer_code: string }>("/customer", {
    method: "POST", body: { email: p.email, first_name: p.firstName, last_name: p.lastName, phone: p.phone, metadata: { doova_user: p.userId } },
  });
  const acct = await call<{ bank: { name: string }; account_number: string; account_name: string }>("/dedicated_account", {
    method: "POST", body: { customer: customer.customer_code, preferred_bank: paystackLive() ? (process.env.PAYSTACK_PREFERRED_BANK ?? "titan-paystack") : "test-bank" },
  });
  return { bank: acct.bank.name, accountNumber: acct.account_number, accountName: acct.account_name, customerCode: customer.customer_code };
}

export async function verifyTransaction(reference: string) {
  return call<{ status: string; amount: number; fees: number | null; reference: string; channel: string; customer: { customer_code: string } }>(
    `/transaction/verify/${encodeURIComponent(reference)}`);
}

// ---------- webhooks ----------
/** Paystack signs each webhook: HMAC-SHA512 of the raw body with the secret key. */
export function validSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Paystack's NGN transfer fee (absorbed by Doova), used when the webhook doesn't say. */
export function estimatedTransferFeeKobo(amountKobo: number) {
  return amountKobo <= 500_000 ? 1_000 : amountKobo <= 5_000_000 ? 2_500 : 5_000;
}

export function friendlyPaystackError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/could not resolve|invalid account|account number/i.test(m)) return "We couldn't find that account. Check the number and the bank.";
  if (/balance|insufficient/i.test(m)) return "Doova can't send this right now. We've been alerted; your money is safe.";
  if (/daily limit|limit/i.test(m) && /test/i.test(m)) return "Paystack test mode only checks a few accounts a day. Try again tomorrow.";
  return "The bank check didn't work just now. Please try again in a minute.";
}
