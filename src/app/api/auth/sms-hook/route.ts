import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Supabase "Send SMS" auth hook. Supabase calls this with each sign-up, sign-in and password-reset
// code; we send it by Termii (a Nigerian SMS provider that can reach DND numbers). Requests are
// signed by Supabase (Standard Webhooks); anything without a valid, recent signature is refused.
//
// Env (Vercel): SUPABASE_SMS_HOOK_SECRET ("v1,whsec_…" from Supabase → Auth → Hooks),
//   TERMII_API_KEY, TERMII_SENDER_ID (the approved Sender ID, e.g. "Doova", or the generic one
//   Termii support gives you), optional TERMII_CHANNEL ("dnd" default: reaches DND numbers, needed
//   for codes in Nigeria; "generic" otherwise) and TERMII_BASE_URL (shown on the Termii dashboard).
// Error messages mention "SMS" so the sign-in screens show "We couldn't send a text right now".
// 13 Nov: if the person just tapped "Send it on WhatsApp" or "Call me with the code" (../code-channel),
// the code goes that way instead: WhatsApp needs TERMII_WHATSAPP_FROM, calls need TERMII_VOICE=on
// (optional TERMII_VOICE_PATH, default /api/sms/otp/call). If that route fails, we fall back to a text.

export const maxDuration = 10;

function verify(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // older than 5 minutes: replay
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

function fail(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status });
}

/** 2348031234567 → 234803…567, so logs never hold whole numbers. */
const mask = (p: string) => (p.length > 7 ? `${p.slice(0, 6)}…${p.slice(-3)}` : "…");

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (!secret) return fail(500, "SMS hook is not configured");
  const body = await request.text();
  if (!verify(body, request.headers, secret)) return fail(401, "Invalid SMS hook signature");

  let phone: string | undefined;
  let otp: string | undefined;
  try {
    const payload = JSON.parse(body) as { user?: { phone?: string }; sms?: { otp?: string } };
    phone = payload.user?.phone?.replace(/\D/g, "");
    otp = payload.sms?.otp;
  } catch {
    return fail(400, "Bad SMS hook payload");
  }
  if (!phone || !otp) return fail(400, "SMS hook payload is missing the phone or code");

  const apiKey = process.env.TERMII_API_KEY;
  const sender = process.env.TERMII_SENDER_ID;
  if (!apiKey || !sender) return fail(500, "SMS provider is not configured");

  const base = (process.env.TERMII_BASE_URL ?? "https://v4.api.termii.com").replace(/\/+$/, "");
  const post = async (path: string, payload: Record<string, unknown>) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, ...payload }),
      signal: AbortSignal.timeout(3500), // Supabase waits about 5 seconds for the hook
    });
    const reply = (await res.json().catch(() => ({}))) as { message_id?: string; pinId?: string; message?: string; code?: string };
    return { ok: res.ok && Boolean(reply.message_id ?? reply.pinId), status: res.status, reply };
  };

  // A WhatsApp or call the person asked for in the last 5 minutes (used once).
  const route = await chosenRoute(phone);
  if (route) {
    try {
      const r = route === "whatsapp"
        ? await post("/api/sms/send", { to: phone, from: process.env.TERMII_WHATSAPP_FROM, sms: otp, type: "plain", channel: "whatsapp_otp" })
        : await post(process.env.TERMII_VOICE_PATH ?? "/api/sms/otp/call", { phone_number: phone, code: otp });
      if (r.ok) { console.log(`sms: sent by ${route}`, mask(phone)); return Response.json({}); }
      console.error(`sms: ${route} refused, sending a text instead`, mask(phone), r.status, r.reply.message ?? r.reply.code ?? "");
    } catch (e) {
      console.error(`sms: ${route} failed, sending a text instead`, mask(phone), e instanceof Error ? e.message : e);
    }
  }

  let status = 0;
  let reply: { message_id?: string; message?: string; code?: string } = {};
  try {
    const r = await post("/api/sms/send", {
      to: phone, from: sender, channel: process.env.TERMII_CHANNEL ?? "dnd", type: "plain",
      sms: `Your Doova code is ${otp}. It expires in 10 minutes. Never share it; Doova will never ask for it.`,
    });
    status = r.status;
    reply = r.reply;
  } catch (e) {
    console.error("sms: Termii unreachable", mask(phone), e instanceof Error ? e.message : e);
    return fail(502, "SMS could not be sent: the text provider didn't answer");
  }
  // Termii answers 200 with a message_id when the text is accepted.
  if (status < 200 || status >= 300 || !reply.message_id) {
    console.error("sms: Termii refused", mask(phone), status, reply.message ?? reply.code ?? "");
    return fail(502, `SMS could not be sent${reply.message ? `: ${reply.message}` : ""}`);
  }
  console.log("sms: sent", mask(phone), reply.message_id);
  return Response.json({});
}

/** The route the person picked on the code screen, if any in the last 5 minutes; marks it used. */
async function chosenRoute(phone: string): Promise<"whatsapp" | "voice" | null> {
  try {
    const db = createAdminClient();
    const { data } = await db.from("code_channel_requests").select("id, channel")
      .eq("phone", phone).is("used_at", null).gte("created_at", new Date(Date.now() - 300_000).toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    await db.from("code_channel_requests").update({ used_at: new Date().toISOString() }).eq("id", data.id);
    return data.channel === "whatsapp" || data.channel === "voice" ? data.channel : null;
  } catch {
    return null;   // table missing (update not run) or database slow: just send a text
  }
}
