import type { Metadata } from "next";
import { AuthPhoto } from "@/components/AuthPhoto";
import { smsCodesOn } from "@/lib/authChannels";
import { ResetFlow } from "./ResetFlow";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  const smsOn = await smsCodesOn();
  return (
    <div className="auth-grid">
      <main className="auth-main"><ResetFlow smsOn={smsOn} /></main>
      <AuthPhoto src="/site/signin-home.webp" alt="Woman at home with her laptop, checking her phone" position="50% 55%" />
    </div>
  );
}
