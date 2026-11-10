import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { supabaseConfigured } from "@/lib/env";
import { SetupNeeded } from "@/components/SetupNeeded";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <header className="auth-top">
        <Logo />
        <Link href="/" className="c-small" style={{ color: "var(--c-ink)" }}>Back to getdoova.com</Link>
      </header>
      {supabaseConfigured() ? <Suspense>{children}</Suspense> : <main className="auth-main"><SetupNeeded /></main>}
    </div>
  );
}
