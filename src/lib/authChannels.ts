import "server-only";
import { connection } from "next/server";

/**
 * Can Doova send text-message codes right now? Codes by email always work (Supabase sends them).
 * SMS_CODES=on|off forces it; otherwise it's on once Termii has both an API key and an approved
 * Sender ID (see src/app/api/auth/sms-hook/route.ts). Read per request, so changing the setting in
 * Vercel takes effect on the next deploy without code changes.
 */
export async function smsCodesOn(): Promise<boolean> {
  await connection();
  const forced = process.env.SMS_CODES?.trim().toLowerCase();
  if (forced === "on") return true;
  if (forced === "off") return false;
  return Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID);
}
