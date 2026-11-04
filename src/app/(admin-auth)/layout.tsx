import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { SetupNeeded } from "@/components/SetupNeeded";
import { supabaseConfigured } from "@/lib/env";

export const metadata = { robots: { index: false, follow: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <header className="auth-top">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Logo href="/admin" /><span className="ad-badge">ADMIN</span>
        </span>
      </header>
      <main className="auth-main">
        {supabaseConfigured() ? <Suspense>{children}</Suspense> : <SetupNeeded />}
      </main>
    </div>
  );
}
