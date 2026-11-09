import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { nowMs } from "@/lib/time";
import { naira, requireProfile } from "@/lib/profile";
import { creatorSummary, eligibility, loadTask, TIER_NAMES } from "@/lib/tasks";
import { startTask } from "./actions";

export const metadata: Metadata = { title: "Task" };

const KIND_LABEL: Record<string, string> = { survey: "Survey", review: "Quick review", labelling: "Labelling", app_test: "App test", other: "Task" };

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const me = await requireProfile();
  const now = nowMs();
  const task = await loadTask(id);
  if (!task) notFound();

  const db = createAdminClient();
  const [creator, { data: mine }, { data: staffRow }, { data: xpSetting }] = await Promise.all([
    creatorSummary(task),
    db.from("submissions").select("status, reserved_until").eq("task_id", id).eq("doer_id", me.id).maybeSingle(),
    task.is_doova ? db.from("staff_members").select("user_id").eq("user_id", me.id).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
    task.reward_kobo === 0 ? db.from("platform_settings").select("value").eq("key", "xp_unpaid_task").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const elig = eligibility(me, task);
  if (staffRow) { elig.rows.push({ ok: false, text: "Doova staff can't take part in Doova's own tasks" }); elig.ok = false; }
  const unpaid = task.reward_kobo === 0;
  const holding = mine?.status === "reserved" && new Date(mine.reserved_until).getTime() > now;
  const done = mine && !["reserved", "expired", "withdrawn"].includes(mine.status);
  const live = task.status === "live" && new Date(task.ends_at).getTime() > now;
  const questions = task.form_schema?.questions.length ?? 0;
  const xp = unpaid ? Number(xpSetting?.value ?? 10) : Math.min(Math.floor(task.reward_kobo / 5000), 80);
  const closes = new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(task.ends_at));

  return (
    <>
      <Link href="/tasks" className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none" }}>
        <Icon name="back" size={16} stroke={2} /> Tasks
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="c-small">{KIND_LABEL[task.kind] ?? "Task"} · closes {closes}</span>
        <h1 className="c-title">{task.title}</h1>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{unpaid ? `${xp} XP` : naira(task.reward_kobo)}</span>
          <span className="c-small">about {task.estimated_minutes} min</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {task.is_doova && <span className="c-pill c-pill-active">From Doova</span>}
          {unpaid ? <span className="c-pill c-pill-quiet">Unpaid · earns XP</span> : <span className="c-xp"><Icon name="spark" size={12} stroke={2.2} /> +{xp} XP when approved</span>}
          <span className="c-pill c-pill-quiet">{creator.slotsLeft} slots left</span>
          <span className="c-pill c-pill-quiet">{task.needs_laptop ? "Needs a laptop" : "Works on a phone"}</span>
        </div>
      </div>

      {unpaid ? (
      <section className="c-card" style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "var(--c-violet-soft)" }}>
        <span style={{ marginTop: 2 }}><Icon name="spark" size={20} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>An unpaid task from Doova</strong>
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>
            Help us test and improve Doova. There&rsquo;s no money for this one; you earn {xp} XP towards your next level when it&rsquo;s approved.
          </span>
        </span>
      </section>
      ) : (
      <section className="c-card" style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "var(--c-paid-soft)" }}>
        <span style={{ marginTop: 2 }}><Icon name="lock" size={20} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>{naira(task.reward_kobo * task.slots)} is locked for this task</strong>
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>
            Your {naira(task.reward_kobo)} is already there. {task.review_mode === "auto"
              ? "You're paid the minute your answers pass the checks."
              : `${task.is_doova ? "Doova" : "The creator"} reviews your work within ${task.auto_approve_hours} hours; if ${task.is_doova ? "we don't" : "they don't"}, it's approved and paid automatically.`}
          </span>
        </span>
      </section>
      )}

      <section className="c-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span className="c-ico" style={{ width: 44, height: 44, fontWeight: 700 }}>{creator.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
        <span className="c-row-main">
          <span className="c-row-title">{creator.name}</span>
          <span className="c-small">
            {task.is_doova ? "Official Doova task" : <>{creator.rating ? `★ ${creator.rating.toFixed(1)} (${creator.ratings}) · ` : "New creator · "}{TIER_NAMES[creator.tier]} creator</>}
          </span>
        </span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="c-h2">What you will do</h2>
        <p className="c-sub" style={{ color: "var(--c-ink)" }}>{task.instructions}</p>
        <p className="c-small" style={{ margin: 0 }}>
          {questions} question{questions === 1 ? "" : "s"}. You have {task.attempt_minutes} minutes once you start; your slot is held for you.
          {" "}Answer carefully: some tasks include a question that checks you&rsquo;re reading.
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="c-h2">{elig.ok ? "You can do this task" : "Not open to you yet"}</h2>
        <div className="c-group">
          {elig.rows.map((r) => (
            <div key={r.text} className="c-row">
              <span className="c-ok-dot" style={{ width: 24, height: 24, borderRadius: 999, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: r.ok ? "var(--c-paid)" : "#F0EFEA" }}>
                <Icon name={r.ok ? "check" : "lock"} size={13} stroke={2.6} />
              </span>
              <span style={{ fontSize: 15 }}>{r.text}</span>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="c-error" role="alert">{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {done ? (
          <Link href={`/tasks/${id}/done`} className="c-btn c-btn-primary c-btn-block">See how it went</Link>
        ) : holding ? (
          <Link href={`/tasks/${id}/do`} className="c-btn c-btn-primary c-btn-block">Carry on with this task</Link>
        ) : !live ? (
          <button className="c-btn c-btn-primary c-btn-block" disabled>This task has closed</button>
        ) : creator.slotsLeft <= 0 ? (
          <button className="c-btn c-btn-primary c-btn-block" disabled>All slots taken</button>
        ) : (
          <form action={startTask.bind(null, id)}>
            <button className="c-btn c-btn-primary c-btn-block" disabled={!elig.ok}>Start task · {task.attempt_minutes} min to finish</button>
          </form>
        )}
      </div>
    </>
  );
}
