import type { Metadata } from "next";
import { SignUpFlow } from "./SignUpFlow";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  return <SignUpFlow startAt={step === "profile" ? "profile" : "phone"} />;
}
