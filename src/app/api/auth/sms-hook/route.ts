import { createHmac, timingSafeEqual } from "node:crypto";

// Supabase "Send SMS" auth hook. Supabase calls this with the code to send; we send it by
// Termii (a Nigerian SMS provider that can reach DND numbers). Requests are signed by Supabase
// (Standard Webhooks); anything without a valid, recent signature is refused.
//
// Env: SUPABASE_SMS_HOOK_SECRET ("v1,whsec_…" from Supabase → Auth → Hooks),
//      TERMII_API_KEY, TERMII_SENDER_ID, optional TERMII_BASE_URL.


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

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (!secret) return fail(500, "SMS hook is not configured");
  const body = await request.text();
  if (!verify(body, request.headers, secret)) return fail(401, "Invalid signature");

  let phone: string | undefined;
  let otp: string | undefined;
  try {
    const payload = JSON.parse(body) as { user?: { phone?: string }; sms?: { otp?: string } };
    phone = payload.user?.phone?.replace(/^\+/, "");
    otp = payload.sms?.otp;
  } catch {
    return fail(400, "Bad payload");
  }
  if (!phone || !otp) return fail(400, "Missing phone or code");

  const apiKey = process.env.TERMII_API_KEY;
  const sender = process.env.TERMII_SENDER_ID;
  if (!apiKey || !sender) return fail(500, "SMS provider is not configured");

  const res = await fetch(`${process.env.TERMII_BASE_URL ?? "https://v3.api.termii.com"}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      to: phone,
      from: sender,
      channel: "dnd",
      type: "plain",
      sms: `Your Doova code is ${otp}. It expires in 10 minutes. Doova will never call you to ask for it.`,
    }),
  });
  if (!res.ok) return fail(502, "Could not send the text");
  return Response.json({});
}
