import type { Metadata } from "next";
import { requireProfile } from "@/lib/profile";
import { PostWizard } from "./PostWizard";

export const metadata: Metadata = { title: "Post a task" };

const TIER_MAX_SLOTS = [0, 200, 1000, 5000, 5000, 5000];

export default async function NewTaskPage() {
  const me = await requireProfile();
  return <PostWizard maxSlots={TIER_MAX_SLOTS[me.creator_tier]} />;
}
