import type { Metadata } from "next";
import { AuthPhoto } from "@/components/AuthPhoto";
import { codeBackups, smsCodesOn } from "@/lib/authChannels";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const smsOn = await smsCodesOn();
  const backups = await codeBackups();
  // Only allow same-site paths, so a link can't send someone to another website after sign-in.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/tasks";
  return (
    <div className="auth-grid">
      <main className="auth-main"><SignInForm next={safeNext} smsOn={smsOn} backups={backups} /></main>
      <AuthPhoto src="/site/signin-home.webp" alt="Woman at home with her laptop, checking her phone" position="50% 55%" />
    </div>
  );
}
