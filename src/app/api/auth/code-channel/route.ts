import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseNigerianPhone } from "@/lib/phone";
import { codeBackups } from "@/lib/authChannels";

// "Send it on WhatsApp" / "Call me with the code": remember the choice for this number for 5 minutes.
// The next code Supabase sends to it goes that way (see ../sms-hook). Choosing only changes how a code is
// delivered to the number's owner, never where, so it needs no sign-in; it's limited to 5 an hour per number.

const WINDOW_MS = 3600_000;
const LIMIT = 5;

export async function POST(request: Request) {
  const { phone: raw, channel } = (await request.json().catch(() => ({}))) as { phone?: string; channel?: string };
  if (channel !== "whatsapp" && channel !== "voice") return Response.json({ error: "Choose WhatsApp or a call." }, { status: 400 });
  const e164 = normaliseNigerianPhone(String(raw ?? ""));
  if (!e164) return Response.json({ error: "That phone number doesn’t look right." }, { status: 400 });
  const on = await codeBackups();
  if (!on[channel]) return Response.json({ error: channel === "whatsapp" ? "WhatsApp codes aren’t switched on yet." : "Code calls aren’t switched on yet." }, { status: 409 });

  const phone = e164.replace(/\D/g, "");
  const db = createAdminClient();
  const { count, error } = await db.from("code_channel_requests").select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
  if (error) return Response.json({ error: "That isn’t available right now. Please try again later." }, { status: 503 });
  if ((count ?? 0) >= LIMIT) return Response.json({ error: "You’ve asked for a lot of codes. Please wait an hour and try again." }, { status: 429 });
  const { error: insError } = await db.from("code_channel_requests").insert({ phone, channel });
  if (insError) return Response.json({ error: "That isn’t available right now. Please try again later." }, { status: 503 });
  return Response.json({ ok: true });
}
