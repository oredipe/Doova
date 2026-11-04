import type { Metadata } from "next";
import { WalletView } from "@/views/WalletView";

export const metadata: Metadata = { title: "Earnings" };

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ withdrawn?: string; acct_error?: string }> }) {
  return <WalletView purse="earnings" sp={await searchParams} />;
}
