import type { Metadata } from "next";
import { WithdrawView } from "@/views/WithdrawView";

export const metadata: Metadata = { title: "Withdraw" };

export default async function WithdrawFunds({ searchParams }: { searchParams: Promise<{ error?: string; done?: string; change?: string }> }) {
  return <WithdrawView purse="funds" base="/create/wallet" sp={await searchParams} />;
}
