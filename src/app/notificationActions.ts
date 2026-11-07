"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/profile";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Remember this phone/browser for push. One person can have several. */
export async function savePushSubscription(sub: Sub, userAgent: string): Promise<{ ok: boolean }> {
  const me = await requireProfile();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions").upsert(
    { user_id: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent.slice(0, 300) },
    { onConflict: "endpoint" });
  if (!error) await db.from("users").update({ notify_push: true }).eq("id", me.id);
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const me = await requireProfile();
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", me.id);
  return { ok: true };
}

export async function setNewTaskAlerts(on: boolean) {
  const me = await requireProfile();
  await createAdminClient().from("users").update({ notify_new_tasks: on }).eq("id", me.id);
  revalidatePath("/settings"); revalidatePath("/notifications");
}
