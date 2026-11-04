import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { SetupNeeded } from "@/components/SetupNeeded";
import { supabaseConfigured } from "@/lib/env";
import { initialsOf, requireProfile } from "@/lib/profile";

// The shell is prerendered; who you are (from the session cookie) streams in.
async function Nav() {
  const me = await requireProfile();
  return <AppNav initials={initialsOf(me.full_name)} />;
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
      <Suspense fallback={<AppNav initials="" />}>
        <Nav />
      </Suspense>
      <main className="shell-main">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
    </div>
  );
}
