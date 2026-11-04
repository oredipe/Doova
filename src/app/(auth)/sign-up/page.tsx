import type { Metadata } from "next";
import { AuthPhoto } from "@/components/AuthPhoto";
import { SignUpFlow } from "./SignUpFlow";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  return (
    <div className="auth-grid">
      <main className="auth-main"><SignUpFlow startAt={step === "profile" ? "profile" : "phone"} /></main>
      <AuthPhoto src="/site/signup-steps.webp" alt="Young man sitting on steps, smiling at his phone" position="50% 40%"
        toast={{ big: "Account ready", line: "Your first task is waiting" }} />
    </div>
  );
}
