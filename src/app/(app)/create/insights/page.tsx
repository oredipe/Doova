import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/creator/TaskList";
import { requireProfile } from "@/lib/profile";
import { loadCreatorTasks } from "@/lib/creator";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsHome() {
  const me = await requireProfile();
  const tasks = (await loadCreatorTasks(me.id)).filter((t) => t.approved > 0);
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="c-small">See what people told you</span>
        <h1 className="c-title">Insights</h1>
      </div>
      <p className="c-sub" style={{ margin: 0 }}>Pick a task to see its answers, compare groups by age, area or doer level, read written answers and follow responses over time.</p>
      {tasks.length === 0 ? (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="data" size={30} /></span>
          <h3 className="c-h2">No answers yet</h3>
          <p className="c-sub" style={{ maxWidth: 380 }}>Insights appear once responses to your tasks are approved.</p>
          <Link href="/create/new" className="c-btn c-btn-primary">Post a task</Link>
        </div>
      ) : <TaskList tasks={tasks} insightsLinks />}
      <section className="c-card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span className="c-ico" style={{ background: "var(--c-violet-soft)", color: "var(--c-violet-text)" }}><Icon name="spark" size={18} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>Coming next: Insights Plus</strong>
          <span className="c-small">Compare two tasks side by side, get the main themes in written answers pulled out for you, and download a PDF report.</span>
        </span>
      </section>
    </>
  );
}
