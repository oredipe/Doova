import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { Logo } from "@/components/Logo";
import { SetupNeeded } from "@/components/SetupNeeded";
import { supabaseConfigured } from "@/lib/env";
import { initialsOf, requireProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// The shell is prerendered; who you are (from the session cookie) streams in.
async function Nav() {
  const me = await requireProfile();
  const db = createAdminClient();
  const [{ count }, { data: mine }] = await Promise.all([
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.id).is("read_at", null),
    db.from("tasks").select("id").eq("creator_type", "user").eq("creator_id", me.id).limit(1000),
  ]);
  const ids = (mine ?? []).map((t) => t.id as string);
  const { count: toReview } = ids.length
    ? await db.from("submissions").select("id", { count: "exact", head: true }).in("task_id", ids).eq("status", "submitted")
    : { count: 0 };
  return <AppNav initials={initialsOf(me.full_name)} name={me.full_name ?? "You"} creatorTier={me.creator_tier}
    unread={count ?? 0} toReview={toReview ?? 0} taskCount={ids.length} />;
}

// Shown for a moment while the session loads (can't read the URL here: that would block prerendering).
function NavFallback() {
  return (
    <header className="shell-head">
      <div className="shell-head-in"><Logo href="/tasks" /></div>
    </header>
  );
}

function PageLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="c-card" style={{ height: 72, opacity: 0.6 }} />
      <div className="c-card" style={{ height: 220, opacity: 0.4 }} />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) {
    return <main className="auth-main"><SetupNeeded /></main>;
  }
  return (
    <div className="shell">
      <Suspense fallback={<NavFallback />}>
        <Nav />
      </Suspense>
      <main className="shell-main">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
    </div>
  );
}
