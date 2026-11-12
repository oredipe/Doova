"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDetails, requireProfile } from "@/lib/profile";
import { GENDERS, NG_STATES, OCCUPATIONS, readDob } from "@/lib/details";

const back = (msg: string, next: string) => redirect(`/profile?error=${encodeURIComponent(msg)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);

/** Save "Your profile". Date of birth can be set once here (after that, support changes it, as it's checked against NIN). */
export async function saveProfile(form: FormData) {
  const me = await requireProfile();
  const cur = await loadDetails(me);
  const nextRaw = String(form.get("next") ?? "");
  const next = /^\/tasks\/[0-9a-f-]{36}$/i.test(nextRaw) ? nextRaw : "";
  if (!cur.ready) back("Profile details open soon. Please try again later.", next);

  const update: Record<string, string | null> = {};
  if (!cur.date_of_birth && (form.get("dob_d") || form.get("dob_m") || form.get("dob_y"))) {
    const r = readDob(String(form.get("dob_d") ?? ""), String(form.get("dob_m") ?? ""), String(form.get("dob_y") ?? ""));
    if (r.error) back(r.error, next);
    update.date_of_birth = r.dob!;
  }
  const state = String(form.get("state") ?? "");
  const area = String(form.get("area") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (state && !(NG_STATES as readonly string[]).includes(state)) back("Choose your state from the list.", next);
  update.home_state = state || null;
  update.home_area = area || null;
  const gender = String(form.get("gender") ?? "");
  update.gender = GENDERS.some((g) => g.value === gender) ? gender : null;
  const work = String(form.get("work") ?? "");
  update.occupation = (OCCUPATIONS as readonly string[]).includes(work) ? work : null;

  const { error } = await createAdminClient().from("users").update({ ...update, updated_at: new Date().toISOString() }).eq("id", me.id);
  if (error) back(error.message.includes("18 or older") ? "You need to be 18 or older to use Doova." : "We couldn’t save that. Please try again.", next);
  revalidatePath("/", "layout");
  redirect(next || "/profile?saved=1");
}
