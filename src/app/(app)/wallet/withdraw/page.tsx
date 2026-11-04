import type { Metadata } from "next";
import { WithdrawView } from "@/views/WithdrawView";

export const metadata: Metadata = { title: "Withdraw" };

export default async function WithdrawEarnings({ searchParams }: { searchParams: Promise<{ error?: string; done?: string; change?: string }> }) {
  return <WithdrawView purse="earnings" base="/wallet" sp={await searchParams} />;
}
