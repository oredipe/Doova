import { createAdminClient } from "@/lib/supabase/admin";
import { estimatedTransferFeeKobo, validSignature, verifyTransaction, verifyTransfer } from "@/lib/paystack";
import { kickPush } from "@/lib/push";

// Paystack calls this for money arriving in a creator's account number (charge.success via a
// dedicated account) and for transfers out (transfer.success / failed / reversed).
// Every event is stored first; the database functions are idempotent, so replays are harmless.
// Paystack expects a 200 quickly; anything we can't handle is logged on the event for staff.

type Event = { event: string; data: Record<string, unknown> & { id?: number | string; reference?: string } };

export async function POST(req: Request) {
  kickPush();
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"))) return new Response("bad signature", { status: 401 });
  let evt: Event;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const db = createAdminClient();
  const eventId = `${evt.event}:${evt.data?.id ?? evt.data?.reference ?? Date.now()}`;
  const { data: stored } = await db.from("webhook_events")
    .upsert({ provider: "paystack", event_id: eventId, event_type: evt.event, payload: evt }, { onConflict: "provider,event_id", ignoreDuplicates: true })
    .select("id").maybeSingle();

  let error: string | null = null;
  try {
    error = await handle(evt);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (stored?.id) await db.from("webhook_events").update({ processed_at: new Date().toISOString(), error }).eq("id", stored.id);
  return new Response("ok");
}

async function handle(evt: Event): Promise<string | null> {
  const db = createAdminClient();
  const d = evt.data;

  if (evt.event === "charge.success") {
    const auth = d.authorization as { channel?: string } | undefined;
    if (d.channel !== "dedicated_nuban" && auth?.channel !== "dedicated_nuban") return "ignored: not a dedicated account payment";
    const tx = await verifyTransaction(String(d.reference));            // never trust the webhook body alone
    if (tx.status !== "success") return `transaction status ${tx.status}`;
    const { data: va } = await db.from("virtual_accounts").select("id, owner_type, owner_id")
      .eq("provider", "paystack").eq("provider_ref", tx.customer.customer_code).maybeSingle();
    if (!va) return `no Doova account for customer ${tx.customer.customer_code}`;
    const { error } = await db.rpc("record_deposit", {
      p_provider: "paystack", p_provider_ref: tx.reference, p_owner_type: va.owner_type, p_owner_id: va.owner_id,
      p_channel: "bank_transfer", p_amount_kobo: tx.amount, p_fee_kobo: tx.fees ?? 0, p_virtual_account_id: va.id,
    });
    return error ? error.message : null;
  }

  if (evt.event === "transfer.success" || evt.event === "transfer.failed" || evt.event === "transfer.reversed") {
    const ref = String(d.reference ?? "");
    if (!/^[0-9a-f-]{36}$/.test(ref)) return "ignored: not a Doova payout reference";
    const t = await verifyTransfer(ref);
    if (t.status === "success") {
      const fee = Number(t.fee_charged ?? (d.fee_charged as number | undefined) ?? NaN);
      const { data: p } = await db.from("payouts").select("transfer_kobo").eq("id", ref).maybeSingle();
      const { error } = await db.rpc("confirm_payout", { p_payout: ref, p_provider_ref: t.transfer_code,
        p_processor_fee_kobo: Number.isFinite(fee) ? fee : estimatedTransferFeeKobo(Number(p?.transfer_kobo ?? 0)) });
      return error ? error.message : null;
    }
    if (t.status === "failed" || t.status === "reversed") {
      const { error } = await db.rpc("fail_payout", { p_payout: ref, p_reason: String(t.gateway_response ?? t.reason ?? t.status).slice(0, 200) });
      return error ? error.message : null;
    }
    return `transfer status ${t.status}`;
  }
  return `ignored: ${evt.event}`;
}
