import type { Metadata } from "next";
import { requireStaff } from "@/lib/staff";
import { budgetNumbers } from "@/lib/doova";
import { PostWizard } from "@/app/(app)/create/new/PostWizard";
import { Top } from "../../Top";
import { createDoovaTask } from "../actions";

export const metadata: Metadata = { title: "New Doova task" };

export default async function NewDoovaTask() {
  await requireStaff("settings.update");
  const { budgetKobo, unpaidXp } = await budgetNumbers();
  return (
    <>
      <Top title="New Doova task" back={{ href: "/admin/doova", label: "Doova tasks" }} />
      <div className="ops-body" style={{ maxWidth: 680 }}>
        <PostWizard maxSlots={100000} doova={{ budgetKobo, unpaidXp }} submit={createDoovaTask} />
      </div>
    </>
  );
}
