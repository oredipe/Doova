import type { Metadata } from "next";
import { SiteHtml } from "@/components/SiteHtml";
import { parts } from "@/site/about";

export const metadata: Metadata = {
  title: "About",
  description: "Honest work should pay. Every time. Why Doova exists and who's behind it.",
};

export default function AboutPage() {
  return <SiteHtml html={parts[0]} />;
}
