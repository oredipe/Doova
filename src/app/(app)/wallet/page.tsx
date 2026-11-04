import type { Metadata } from "next";
import { WalletView } from "@/views/WalletView";

export const metadata: Metadata = { title: "Earnings" };

export default function WalletPage() {
  return <WalletView purse="earnings" />;
}
