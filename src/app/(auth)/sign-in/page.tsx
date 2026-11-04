import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only allow same-site paths, so a link can't send someone to another website after sign-in.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/tasks";
  return <SignInForm next={safeNext} />;
}
