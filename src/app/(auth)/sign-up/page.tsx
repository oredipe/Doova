import type { Metadata } from "next";
import { AuthPhoto } from "@/components/AuthPhoto";
import { smsCodesOn } from "@/lib/authChannels";
import { SignUpFlow } from "./SignUpFlow";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ step?: string; as?: string }> }) {
  const { step, as } = await searchParams;
  const smsOn = await smsCodesOn();
  return (
    <div className="auth-grid">
      <main className="auth-main"><SignUpFlow startAt={step === "profile" ? "profile" : "start"} smsOn={smsOn} startMode={as === "create" ? "create" : "earn"} /></main>
      <AuthPhoto src="/site/signup-steps.webp" alt="Young man sitting on steps, smiling at his phone" position="50% 40%"
        toast={{ big: "Account ready", line: "Your first task is waiting" }} />
    </div>
  );
}
