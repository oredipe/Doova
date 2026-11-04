import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/server";
import type { Answers, FormSchema } from "@/lib/tasks";

// Every approved answer to a creator's task, as a spreadsheet (CSV). Doers appear by number only.

const cell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
  // Quote everything; neutralise formulas so a spreadsheet won't run them.
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const db = createAdminClient();
  const { data: t } = await db.from("tasks").select("title, form_schema, creator_type, creator_id").eq("id", id).maybeSingle();
  if (!t || t.creator_type !== "user" || t.creator_id !== user.id) return new Response("Not found", { status: 404 });

  const { data: subs } = await db.from("submissions").select("submitted_at, answers").eq("task_id", id).eq("status", "approved")
    .order("submitted_at", { ascending: true }).limit(10000);
  const qs = (t.form_schema as FormSchema | null)?.questions ?? [];
  const lines = [["Response", "Submitted (Lagos time)", ...qs.map((q) => q.label)].map(cell).join(",")];
  (subs ?? []).forEach((s, i) => {
    const a = (s.answers ?? {}) as Answers;
    const when = s.submitted_at ? new Date(s.submitted_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" }) : "";
    lines.push([i + 1, when, ...qs.map((q) => a[q.id])].map(cell).join(","));
  });
  const name = String(t.title).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "doova-task";
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-answers.csv"`, "Cache-Control": "no-store" },
  });
}
