import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { supabaseConfigured } from "@/lib/env";
import { getAuthUser } from "@/lib/supabase/server";

// Placeholder front door until the doova.ng website pages are built (step 6).
// Signed-in people go straight to their tasks. Runs at request time, inside Suspense.
async function SignedInRedirect() {
  if (supabaseConfigured()) {
    const user = await getAuthUser();
    if (user?.user_metadata?.profile_complete) redirect("/tasks");
  }
  return null;
}

export default function Home() {
  return (
    <div className="auth">
      <Suspense><SignedInRedirect /></Suspense>
      <header className="auth-top">
        <Logo />
        <Link href="/sign-in" className="c-small" style={{ color: "var(--c-ink)", fontWeight: 600 }}>Sign in</Link>
      </header>
      <main className="auth-main" style={{ justifyContent: "center" }}>
        <span className="c-pill c-pill-lime" style={{ alignSelf: "flex-start" }}>
          <Icon name="lock" size={12} stroke={2.2} /> Every reward is locked before a task goes live
        </span>
        <h1 style={{ fontSize: 48, lineHeight: 0.95, letterSpacing: "-0.04em", fontWeight: 700, margin: 0 }}>
          Real tasks.<br />Real pay.<br />No wahala.
        </h1>
        <p className="c-sub" style={{ fontSize: 17 }}>
          Doova connects Nigerians who want to earn from their phone with businesses that need real answers.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/sign-up" className="c-btn c-btn-primary c-btn-block">Start earning</Link>
          <Link href="/sign-in" className="c-btn c-btn-quiet c-btn-block">I already have an account</Link>
        </div>
      </main>
    </div>
  );
}
