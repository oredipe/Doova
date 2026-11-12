import { getAuthUser } from "@/lib/supabase/server";
import { EmailPrompt } from "@/components/EmailPrompt";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDetails, naira, requireProfile } from "@/lib/profile";
import { completion } from "@/lib/details";
import { ProfileBanner } from "@/components/ProfileBanner";
import { PushPrompt } from "@/components/PushPrompt";
import { vapidKeys } from "@/lib/push";

export const metadata: Metadata = { title: "Tasks" };

type FeedTask = {
  id: string; title: string; reward_kobo: number; slots_left: number; estimated_minutes: number;
  kind: string; needs_laptop: boolean; creator_name: string; ends_at: string; is_doova: boolean;
};

const LEVEL_NAMES = ["", "Starter", "Regular", "Skilled", "Pro", "Expert"];
const LEVEL_XP = [0, 0, 100, 400, 1000, 2500];

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ welcome?: string; reset?: string }> }) {
  const { welcome, reset } = await searchParams;
  const me = await requireProfile();
  const db = createAdminClient();
  const minePromise = db.from("submissions").select("task_id, status").eq("doer_id", me.id);
  const { data, error } = await db
    .from("v_task_feed")
    .select("id, title, reward_kobo, slots_left, estimated_minutes, kind, needs_laptop, creator_name, ends_at, is_doova")
    .gt("slots_left", 0)
    .order("went_live_at", { ascending: false })
    .limit(50);
  const tasks = (data ?? []) as FeedTask[];
  const { data: mine } = await minePromise;
  const myStatus = new Map((mine ?? []).map((m) => [m.task_id as string, m.status as string]));
  const STATUS_PILL: Record<string, [string, string]> = {
    reserved: ["c-pill c-pill-active", "In progress"], submitted: ["c-pill c-pill-quiet", "Waiting for review"],
    approved: ["c-pill c-pill-lime", "Paid"], appealed: ["c-pill c-pill-quiet", "Appeal open"],
    rejected: ["c-pill c-pill-bad", "Not approved"], rejected_final: ["c-pill c-pill-bad", "Not approved"],
  };
  const next = Math.min(me.level + 1, 5);
  const pct = me.level >= 5 ? 100 : Math.min(100, Math.round(((me.xp - LEVEL_XP[me.level]) / (LEVEL_XP[next] - LEVEL_XP[me.level])) * 100));
  const first = me.full_name?.split(" ")[0] ?? "there";
  const details = await loadDetails(me);
  const keys = await vapidKeys().catch((e) => { console.error("push keys:", e instanceof Error ? e.message : e); return null; });

  return (
    <>
      {reset && (
        <div className="c-note" role="status">
          <Icon name="check" size={18} />
          <span>Your new password is saved. Use it next time you sign in.</span>
        </div>
      )}
      {welcome && (
        <div className="c-note" role="status">
          <Icon name="spark" size={18} />
          <span>Welcome to Doova, {first}. New tasks appear here as soon as creators lock the money in.</span>
        </div>
      )}
      {details.ready && <ProfileBanner pct={completion(details)} />}
      {keys && <PushPrompt publicKey={keys.publicKey} />}
      {!details.ready && !(await getAuthUser())?.email && <EmailPrompt />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="c-small">{greeting()}</span>
          <h1 className="c-title">{first}</h1>
        </div>
        <span className="c-xp" title={`${me.xp} XP`}>Level {me.level} · {LEVEL_NAMES[me.level]}</span>
      </div>

      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="Your level">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontWeight: 600 }}>{me.level >= 5 ? "Top level reached" : `${me.xp} of ${LEVEL_XP[next]} XP to Level ${next}`}</span>
          <span className="c-small">{me.streak_days > 0 ? `${me.streak_days}-day streak` : "Do 2 tasks today to start a streak"}</span>
        </div>
        <div className="c-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
          <span style={{ width: `${pct}%` }} />
        </div>
      </section>

      <h2 className="c-sec">Tasks for you</h2>
      {error && <p className="c-error">We couldn&rsquo;t load tasks just now. Pull to refresh in a moment.</p>}
      {!error && tasks.length === 0 && (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="tasks" size={30} /></span>
          <h3 className="c-h2">No tasks right now</h3>
          <p className="c-sub" style={{ maxWidth: 360 }}>
            Every task here has its reward locked in before it goes live. We&rsquo;ll show new ones the moment they&rsquo;re ready.
          </p>
        </div>
      )}
      {tasks.length > 0 && (
        <div className="c-group">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="c-row">
              <div className="c-row-main">
                {t.is_doova
                  ? <span className="c-pill c-pill-active" style={{ alignSelf: "flex-start" }}><Icon name="spark" size={12} stroke={2.2} /> From Doova</span>
                  : <span className="c-small">{t.creator_name}</span>}
                <span className="c-row-title">{t.title}</span>
                <span className="c-small">
                  About {t.estimated_minutes} min · {t.slots_left} slots left{t.needs_laptop ? " · Laptop" : ""}
                </span>
                {STATUS_PILL[myStatus.get(t.id) ?? ""] ? (
                  <span className={STATUS_PILL[myStatus.get(t.id)!][0]} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    {t.reward_kobo === 0 && myStatus.get(t.id) === "approved" ? "Done" : STATUS_PILL[myStatus.get(t.id)!][1]}
                  </span>
                ) : t.reward_kobo === 0 ? (
                  <span className="c-pill c-pill-quiet" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    <Icon name="spark" size={12} stroke={2.2} /> Unpaid · earns XP
                  </span>
                ) : (
                  <span className="c-pill c-pill-paid" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    <Icon name="lock" size={12} stroke={2.2} /> Reward locked
                  </span>
                )}
              </div>
              <span className="c-amt">{t.reward_kobo === 0 ? "XP" : naira(t.reward_kobo)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
