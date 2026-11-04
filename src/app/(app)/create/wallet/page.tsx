import type { Metadata } from "next";
import { WalletView } from "@/views/WalletView";

export const metadata: Metadata = { title: "Creator funds" };

export default function CreatorWalletPage() {
  return <WalletView purse="funds" />;
}
