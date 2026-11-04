"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyStaffError, requireStaff } from "@/lib/staff";

const back = (msg: string, key = "error") => redirect(`/admin/money?${key}=${encodeURIComponent(msg)}`);

export async function recordStatement(form: FormData) {
  const me = await requireStaff("reconcile");
  const provider = String(form.get("provider"));
  const date = String(form.get("date"));
  const naira = Number(String(form.get("amount") ?? "").replace(/[₦,\s]/g, ""));
  const note = String(form.get("note") ?? "").trim();
  if (!["paystack", "monnify"].includes(provider)) back("Choose the partner.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back("Choose the statement date.");
  if (!Number.isFinite(naira) || naira < 0) back("Enter the closing balance from the statement, in naira.");
  const { data, error } = await createAdminClient().rpc("staff_reconcile", {
    p_staff: me.id, p_provider: provider, p_date: date, p_statement_kobo: Math.round(naira * 100), p_note: note || null,
  });
  if (error) back(friendlyStaffError(error.message));
  revalidatePath("/admin", "layout");
  back(Number(data) === 0 ? "matched" : "different", "done");
}

export async function explainDifference(id: number, form: FormData) {
  const me = await requireStaff("reconcile");
  const note = String(form.get("note") ?? "").trim();
  const { error } = await createAdminClient().rpc("staff_explain_reconciliation", { p_staff: me.id, p_id: id, p_note: note });
  if (error) back(friendlyStaffError(error.message));
  revalidatePath("/admin/money");
  back("explained", "done");
}
