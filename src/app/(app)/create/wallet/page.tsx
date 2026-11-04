import type { Metadata } from "next";
import { WalletView } from "@/views/WalletView";

export const metadata: Metadata = { title: "Creator funds" };

export default async function CreatorWalletPage({ searchParams }: { searchParams: Promise<{ withdrawn?: string; acct_error?: string }> }) {
  return <WalletView purse="funds" sp={await searchParams} />;
}
