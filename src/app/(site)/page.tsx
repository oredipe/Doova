import type { Metadata } from "next";
import { SiteHtml } from "@/components/SiteHtml";
import { parts } from "@/site/home";

export const metadata: Metadata = {
  title: { absolute: "Doova: real tasks, real pay" },
  description: "Earn from your phone in your free minutes, or get real answers from real Nigerians. Every reward is locked before a task goes live.",
};

export default function HomePage() {
  return <SiteHtml html={parts[0]} />;
}
