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

/**
 * Backup routes for phone codes (13 Nov 2026), offered on the code screen when a text doesn't arrive:
 * WhatsApp needs TERMII_WHATSAPP_FROM (the WhatsApp device name Termii support gives you once they enable
 * WhatsApp OTP on the account); a voice call needs TERMII_VOICE=on (Termii reads the code out).
 */
export type CodeBackups = { whatsapp: boolean; voice: boolean };
export async function codeBackups(): Promise<CodeBackups> {
  await connection();
  const key = Boolean(process.env.TERMII_API_KEY);
  return { whatsapp: key && Boolean(process.env.TERMII_WHATSAPP_FROM), voice: key && process.env.TERMII_VOICE?.trim().toLowerCase() === "on" };
}
