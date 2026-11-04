import type { Metadata } from "next";
import { WalletView } from "@/views/WalletView";

export const metadata: Metadata = { title: "Wallet" };

export default function CreatorWalletPage() {
  return <WalletView />;
}
