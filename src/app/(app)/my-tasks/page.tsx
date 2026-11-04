import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { requireProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "My tasks" };

export default async function MyTasksPage() {
  await requireProfile();
  return (
    <>
      <h1 className="c-title">My tasks</h1>
      <div className="c-card empty">
        <span className="empty-art"><Icon name="mytasks" size={30} /></span>
        <h2 className="c-h2">Nothing here yet</h2>
        <p className="c-sub" style={{ maxWidth: 360 }}>Tasks you start, submit and get paid for will show here, with their status.</p>
      </div>
    </>
  );
}
