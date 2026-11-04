import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { naira } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { ago, can, lagosDate, lagosDayStart, requireStaff } from "@/lib/staff";
import { nowMs } from "@/lib/time";
import { Top } from "./Top";

export const metadata: Metadata = { title: "Overview" };

type Need = { href: string; icon: "tasks" | "info" | "out"; title: string; sub: string; when: string; urgent: boolean; due: number };

export default async function AdminOverview() {
  const me = await requireStaff();
  const now = nowMs();
  const db = createAdminClient();
  const [totals, recon, tasks, appeals, failed, numbers, week] = await Promise.all([
    db.from("v_money_totals").select("bucket, balance_kobo"),
    db.from("reconciliations").select("statement_date, difference_kobo, created_at, note").order("statement_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("tasks").select("id, title, funded_at, reward_kobo, slots").eq("status", "under_moderation").order("funded_at").limit(50),
    db.from("appeals").select("id, created_at, submissions(tasks(title, reward_kobo), users!submissions_doer_id_fkey(full_name))").eq("status", "open").order("created_at").limit(50),
    db.from("payouts").select("id, amount_kobo, failure_reason, completed_at, owner_id").eq("status", "failed").order("completed_at", { ascending: false }).limit(20),
    db.rpc("admin_numbers_since", { p_since: lagosDayStart(now) }),
    db.rpc("admin_funded_by_day", { p_days: 7 }),
  ]);
  const t = Object.fromEntries((totals.data ?? []).map((r) => [r.bucket as string, Number(r.balance_kobo)]));
  const owed = ["earnings", "creator_funds", "business_funds", "task_escrow", "payouts_in_flight"].reduce((s, k) => s + (t[k] ?? 0), 0);
  const n = (numbers.data ?? {}) as Record<string, number>;
  const taskRows = tasks.data ?? [];
  const appealRows = (appeals.data ?? []) as unknown as { id: string; created_at: string; submissions: { tasks: { title: string; reward_kobo: number } | null; users: { full_name: string | null } | null } | null }[];
  const failedRows = failed.data ?? [];
  const r = recon.data;

  const needs: Need[] = [];
  if (can(me.role, "appeal.decide")) for (const a of appealRows) {
    const due = new Date(a.created_at).getTime() + 24 * 3600_000;
    needs.push({ href: `/admin/disputes/${a.id}`, icon: "info", title: `Appeal: ${a.submissions?.users?.full_name ?? "A doer"}`,
      sub: `${a.submissions?.tasks?.title ?? "Task"} · ${naira(a.submissions?.tasks?.reward_kobo ?? 0)} · decide by ${lagosDate(new Date(due), { hour: "numeric", minute: "2-digit" })}`,
      when: due > now ? `Due in ${ago(now, due)}` : `Overdue ${ago(due, now)}`, urgent: due - now < 6 * 3600_000, due });
  }
  if (can(me.role, "money.view")) for (const p of failedRows) {
    needs.push({ href: "/admin/payouts", icon: "out", title: `Payout failed: ${naira(p.amount_kobo)}`, sub: p.failure_reason ?? "No reason given",
      when: `Since ${lagosDate(p.completed_at ?? new Date(now), { hour: "numeric", minute: "2-digit" })}`, urgent: true, due: new Date(p.completed_at ?? now).getTime() });
  }
  if (can(me.role, "task.moderate")) for (const x of taskRows) {
    const since = new Date(x.funded_at ?? now).getTime();
    needs.push({ href: `/admin/tasks/${x.id}`, icon: "tasks", title: `Task approval: ${x.title}`, sub: `${naira(x.reward_kobo)} a slot · ${x.slots} slots`,
      when: `Waiting ${ago(since, now)}`, urgent: now - since > 4 * 3600_000, due: since + 4 * 3600_000 });
  }
  needs.sort((a, b) => a.due - b.due);

  const days = (week.data ?? []) as { day: string; funded_kobo: number }[];
  const max = Math.max(1, ...days.map((d) => Number(d.funded_kobo)));
  const hour = Number(new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date(now)));
  const oldestTask = taskRows[0]?.funded_at ? `Oldest waiting ${ago(new Date(taskRows[0].funded_at).getTime(), now)}` : "Nothing waiting";
  const nextAppeal = appealRows[0] ? new Date(appealRows[0].created_at).getTime() + 24 * 3600_000 : null;
  const k = (v: number) => (v >= 100_000 ? `₦${Math.round(v / 100_000)}k` : naira(v));   // kobo → ₦428k

  return (
    <>
      <Top title={`${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${me.name.split(" ")[0]}`}
        sub={lagosDate(new Date(now), { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} />
      <div className="ad-body">
        <div className="ad-stats">
          <Link href={can(me.role, "money.view") ? "/admin/money" : "/admin"} className="ad-stat ad-stat-money">
            <span className="c-small" style={{ color: "var(--c-ink)" }}>Users&rsquo; money held</span>
            <strong>{naira(owed)}</strong>
            <span className="c-small" style={{ color: r && Number(r.difference_kobo) !== 0 && !r.note ? "var(--c-bad)" : "var(--c-ink)" }}>
              {!r ? "Not checked against the bank yet" : Number(r.difference_kobo) === 0 ? `Matched the bank · ${lagosDate(r.statement_date, { day: "numeric", month: "short" })}` : `${naira(Math.abs(Number(r.difference_kobo)))} difference · ${lagosDate(r.statement_date, { day: "numeric", month: "short" })}`}
            </span>
          </Link>
          <Link href="/admin/tasks" className="ad-stat"><span className="c-small">Tasks to approve</span><strong>{taskRows.length}</strong><span className="c-small">{oldestTask}</span></Link>
          <Link href="/admin/disputes" className="ad-stat"><span className="c-small">Disputes</span><strong>{appealRows.length}</strong>
            <span className="c-small" style={{ color: nextAppeal && nextAppeal - now < 6 * 3600_000 ? "var(--c-bad)" : undefined, fontWeight: nextAppeal ? 600 : 400 }}>
              {nextAppeal ? (nextAppeal > now ? `Next due in ${ago(now, nextAppeal)}` : "One is overdue") : "None open"}</span></Link>
          <Link href="/admin/payouts" className="ad-stat"><span className="c-small">Failed payouts</span><strong>{failedRows.length}</strong>
            <span className="c-small" style={{ color: failedRows.length ? "var(--c-bad)" : undefined }}>{failedRows.length ? `${naira(failedRows.reduce((s, p) => s + p.amount_kobo, 0))} waiting on you` : "None"}</span></Link>
        </div>

        <div className="ad-two">
          <div className="ad-col">
            <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <h2 className="c-h2">Needs you now</h2><span className="c-small">Soonest deadline first</span>
              </div>
              {needs.length === 0 ? <p className="c-sub">All clear. New tasks, appeals and failed payouts show up here.</p> : needs.slice(0, 8).map((x) => (
                <Link key={x.href + x.title} href={x.href} className="c-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <span className="c-ico" style={{ background: "#F2F2EC" }}><Icon name={x.icon} size={18} /></span>
                  <span className="c-row-main"><span className="c-row-title" style={{ fontSize: 16 }}>{x.title}</span><span className="c-small">{x.sub}</span></span>
                  <span className="c-small" style={{ whiteSpace: "nowrap", color: x.urgent ? "var(--c-bad)" : undefined, fontWeight: x.urgent ? 600 : 400 }}>{x.when}</span>
                  <Icon name="chev" size={16} />
                </Link>
              ))}
            </section>
            <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h2 className="c-h2">Rewards funded this week</h2>
              <div className="ad-bars">
                {days.map((d, i) => (
                  <div key={d.day} className={i === days.length - 1 ? "ad-bar today" : "ad-bar"}>
                    <span>{Number(d.funded_kobo) ? k(Number(d.funded_kobo)) : ""}</span>
                    <span className="b" style={{ height: `${Math.round((Number(d.funded_kobo) / max) * 130)}px` }} />
                    <span>{lagosDate(`${d.day}T12:00:00+01:00`, { weekday: "short" })}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="ad-col">
            <section className="c-card">
              <h2 className="c-h2" style={{ marginBottom: 6 }}>Today so far</h2>
              <div className="ad-kv"><span>Rewards funded</span><span>{naira(n.funded_kobo ?? 0)} · {n.funded_tasks ?? 0} tasks</span></div>
              <div className="ad-kv"><span>Paid to doers</span><span>{naira(n.paid_kobo ?? 0)} · {n.paid_count ?? 0}</span></div>
              <div className="ad-kv"><span>Withdrawals</span><span>{naira(n.withdrawn_kobo ?? 0)} · {n.withdrawals ?? 0}</span></div>
              <div className="ad-kv"><span>New sign-ups</span><span>{n.signups ?? 0}</span></div>
              <div className="ad-kv"><span>NIN checks</span><span>{n.nin_checks ?? 0}</span></div>
              <div className="ad-kv"><span>Doova fees earned</span><span>{naira(n.fees_kobo ?? 0)}</span></div>
            </section>
            {can(me.role, "money.view") && (
              <section className="c-card">
                <h2 className="c-h2" style={{ marginBottom: 6 }}>Payout balances</h2>
                <div className="ad-kv"><span>Paystack</span><span>{naira(t.custody_paystack ?? 0)}</span></div>
                <div className="ad-kv"><span>Monnify</span><span>{naira(t.custody_monnify ?? 0)}</span></div>
                <p className="c-small" style={{ marginTop: 8 }}>What our records say each partner holds. The money check compares this with the bank.</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
