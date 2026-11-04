import type { Metadata } from "next";
import { SiteHtml } from "@/components/SiteHtml";
import { parts } from "@/site/doers";

export const metadata: Metadata = {
  title: "For doers",
  description: "Answer surveys, test apps and rate ideas for real businesses. Every reward is locked before you start, and you're paid the minute you're approved.",
};

export default function DoersPage() {
  return <SiteHtml html={parts[0]} />;
}
