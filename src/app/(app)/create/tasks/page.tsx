import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/creator/TaskList";
import { requireProfile } from "@/lib/profile";
import { loadCreatorTasks, taskGroup } from "@/lib/creator";

export const metadata: Metadata = { title: "Your tasks" };

const TABS = [
  { key: "all", label: "All" }, { key: "live", label: "Live" }, { key: "checking", label: "Being checked" },
  { key: "drafts", label: "Drafts" }, { key: "closed", label: "Closed" },
] as const;

export default async function CreatorTasks({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const sp = await searchParams;
  const me = await requireProfile();
  const all = await loadCreatorTasks(me.id);
  const show = TABS.some((t) => t.key === sp.show) ? sp.show! : "all";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const count = (k: string) => (k === "all" ? all.length : all.filter((t) => taskGroup(t.status) === k).length);
  const tasks = all.filter((t) => (show === "all" || taskGroup(t.status) === show) && (!q || t.title.toLowerCase().includes(q)));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="c-small">{all.length} task{all.length === 1 ? "" : "s"}</span>
          <h1 className="c-title">Tasks</h1>
        </div>
        <form role="search" style={{ display: "flex", gap: 8, flex: "1 1 240px", maxWidth: 360 }}>
          {show !== "all" && <input type="hidden" name="show" value={show} />}
          <input name="q" defaultValue={sp.q ?? ""} className="c-input" style={{ minHeight: 44 }} placeholder="Search your tasks" aria-label="Search your tasks" />
          <button className="c-ic-btn" style={{ width: 44, height: 44 }} aria-label="Search"><Icon name="search" size={18} /></button>
        </form>
      </div>
      <nav className="c-tabs" aria-label="Filter tasks">
        {TABS.map((t) => (
          <Link key={t.key} className="c-tab" href={t.key === "all" ? "/create/tasks" : `/create/tasks?show=${t.key}`} aria-current={show === t.key ? "page" : undefined}>
            {t.label} <span className="c-small">{count(t.key)}</span>
          </Link>
        ))}
      </nav>
      {tasks.length === 0 ? (
        <div className="c-card empty">
          <span className="empty-art"><Icon name="tasks" size={30} /></span>
          <h3 className="c-h2">{q ? "No tasks match that search" : all.length ? "Nothing here" : "No tasks yet"}</h3>
          <p className="c-sub" style={{ maxWidth: 380 }}>{all.length ? "Try another filter." : "Post your first task. You only pay for work that passes your checks."}</p>
          {!all.length && <Link href="/create/new" className="c-btn c-btn-primary">Post a task</Link>}
        </div>
      ) : <TaskList tasks={tasks} />}
    </>
  );
}
