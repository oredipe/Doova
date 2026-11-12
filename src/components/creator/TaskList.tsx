import Link from "next/link";
import { naira } from "@/lib/profile";
import { taskStatusOf, type CreatorTask } from "@/lib/creator";

const KIND: Record<string, string> = { survey: "Survey", review: "Review", labelling: "Labelling", app_test: "App test" };
const day = (iso: string) => new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(iso));

/** A creator's tasks as rows: status, progress, and what needs doing. */
export function TaskList({ tasks, insightsLinks = false }: { tasks: CreatorTask[]; insightsLinks?: boolean }) {
  return (
    <div className="c-group">
      {tasks.map((t) => {
        const st = taskStatusOf(t);
        const pct = Math.round((t.approved / Math.max(1, t.slots)) * 100);
        const href = t.status === "pending_funding" ? `/create/tasks/${t.id}/fund` : insightsLinks ? `/create/tasks/${t.id}?tab=insights` : `/create/tasks/${t.id}`;
        const when = ["closed", "settled"].includes(t.status) ? `closed ${day(t.ends_at)}` : ["draft", "pending_funding"].includes(t.status) ? "not posted yet" : `closes ${day(t.ends_at)}`;
        return (
          <Link key={t.id} href={href} className="c-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <span className="c-row-title">{t.title}</span>
              <span className={st.pill}>{st.label}</span>
            </span>
            <span className="c-small">
              {KIND[t.kind] ?? "Task"} · {naira(t.reward_kobo)} a slot · {when} · {t.approved} of {t.slots} approved{t.waiting ? ` · ${t.waiting} to review` : ""}
            </span>
            <span className="c-bar"><span style={{ width: `${pct}%` }} /></span>
          </Link>
        );
      })}
    </div>
  );
}
