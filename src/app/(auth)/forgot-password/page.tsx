import type { Metadata } from "next";
import { AuthPhoto } from "@/components/AuthPhoto";
import { ResetFlow } from "./ResetFlow";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="auth-grid">
      <main className="auth-main"><ResetFlow /></main>
      <AuthPhoto src="/site/signin-home.webp" alt="Woman at home with her laptop, checking her phone" position="50% 55%" />
    </div>
  );
}
