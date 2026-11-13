import type { Metadata } from "next";
import { AuthPhoto } from "@/components/AuthPhoto";
import { codeBackups, smsCodesOn } from "@/lib/authChannels";
import { ResetFlow } from "./ResetFlow";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  const smsOn = await smsCodesOn();
  const backups = await codeBackups();
  return (
    <div className="auth-grid">
      <main className="auth-main"><ResetFlow smsOn={smsOn} backups={backups} /></main>
      <AuthPhoto src="/site/signin-home.webp" alt="Woman at home with her laptop, checking her phone" position="50% 55%" />
    </div>
  );
}
