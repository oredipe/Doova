import type { Metadata } from "next";
import { SettingsView } from "@/views/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function CreatorSettingsPage() {
  return <SettingsView mode="create" />;
}
