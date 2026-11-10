import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { initialsOf } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { lagosDate, requireStaff } from "@/lib/staff";
import { LEVEL_NAMES } from "@/lib/tasks";
import { Top } from "../Top";

export const metadata: Metadata = { title: "Users" };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("user.view");
  const { q = "" } = await searchParams;
  const db = createAdminClient();
  let query = db.from("users").select("id, full_name, phone, email, level, creator_tier, status, kyc_tier, created_at, staff_only").order("created_at", { ascending: false }).limit(50);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) {
    const digits = term.replace(/\D/g, "");
    const phone = digits.length >= 4 ? (digits.startsWith("0") ? digits.slice(1) : digits.replace(/^234/, "")) : null;
    query = query.or([`full_name.ilike.%${term}%`, phone ? `phone.ilike.%${phone}%` : null, term.includes("@") || term.includes(".") ? `email.ilike.%${term}%` : null].filter(Boolean).join(","));
  }
  const { data } = await query;
  const rows = data ?? [];
  return (
    <>
      <Top title="Users" sub={term ? `Results for “${term}”` : "Newest first"} />
      <div className="ops-body">
        <form className="ops-search" role="search" style={{ maxWidth: 520 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
          <input name="q" defaultValue={term} placeholder="Name, phone number or email" aria-label="Search people" />
        </form>
        {rows.length === 0 ? <div className="c-card"><p className="c-sub">No one matches.</p></div> : (
          <div className="c-group">
            {rows.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="c-row">
                <span className="c-ico" style={{ background: "var(--c-paid-soft)", fontWeight: 700, fontSize: 13 }}>{initialsOf(u.full_name)}</span>
                <span className="c-row-main">
                  <span className="c-row-title" style={{ fontSize: 16 }}>{u.full_name ?? "No name yet"}</span>
                  <span className="c-small">{u.staff_only ? "Admin-only staff account" : `${u.phone ?? u.email} · Level ${u.level} ${LEVEL_NAMES[u.level]}`} · joined {lagosDate(u.created_at, { day: "numeric", month: "short" })}{u.kyc_tier ? " · NIN checked" : ""}</span>
                </span>
                {u.status !== "active" && <span className="c-pill c-pill-bad" style={{ textTransform: "capitalize" }}>{u.status}</span>}
                <Icon name="chev" size={16} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
