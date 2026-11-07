import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPending } from "@/lib/push";

// Called every minute by the database scheduler (only when pushes are waiting), with a shared secret
// that lives in the database itself.
export async function POST(req: Request) {
  const given = req.headers.get("x-dispatch-secret") ?? "";
  const { data } = await createAdminClient().from("platform_settings").select("value").eq("key", "push_dispatch_secret").maybeSingle();
  if (!given || given !== String(data?.value ?? "")) return new Response("forbidden", { status: 403 });
  const r = await dispatchPending();
  return Response.json(r);
}
