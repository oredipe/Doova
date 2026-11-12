import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AGE_BANDS } from "@/lib/details";
import type { Answers, Question } from "@/lib/tasks";

// Task Insights v1 (12 Nov 2026): Answers (filters + compare groups), Written answers, Trends.
// Everything is worked out on the server from approved responses. Privacy: any group, or filtered set,
// with fewer than MIN_GROUP people is hidden, and no answer is ever shown next to who gave it.

export const MIN_GROUP = 5;
export type InsightRow = { answers: Answers | null; at: string; level: number; age: string | null; state: string | null; seconds: number | null };
export type InsightParams = { view: "answers" | "written" | "trends"; age?: string; state?: string; level?: string; by: "none" | "age" | "area" | "level"; q?: string; find?: string; n?: number };

const COLORS = ["#111111", "#6B4EE6", "#B7AEF2", "#8A8982"];
const LEVELS = ["1", "2", "3", "4", "5"];
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayLabel = (key: string, withMonth: boolean) => {
  const d = new Date(key + "T12:00:00Z");
  return withMonth ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" }).format(d) : String(d.getUTCDate());
};
const isChoice = (q: Question) => q.type === "single_choice" || q.type === "multi_choice";
const isText = (q: Question) => q.type === "short_text" || q.type === "long_text";
const has = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
const picked = (v: unknown, o: string) => (Array.isArray(v) ? v.includes(o) : v === o);

export function filterRows(rows: InsightRow[], p: InsightParams) {
  return rows.filter((r) => (!p.age || r.age === p.age) && (!p.state || r.state === p.state) && (!p.level || String(r.level) === p.level));
}

function groupKey(r: InsightRow, by: InsightParams["by"]): string | null {
  if (by === "age") return r.age;
  if (by === "area") return r.state;
  if (by === "level") return r.level <= 2 ? "Level 1 to 2" : r.level === 3 ? "Level 3" : "Level 4 to 5";
  return null;
}

export function Insights({ taskId, questions, rows: all, slots, p, exportHref }: {
  taskId: string; questions: Question[]; rows: InsightRow[]; slots: number; p: InsightParams; exportHref: string;
}) {
  const base = `/create/tasks/${taskId}`;
  const href = (o: Partial<InsightParams>) => {
    const m = { ...p, ...o };
    const qs = new URLSearchParams({ tab: "insights", view: m.view });
    for (const k of ["age", "state", "level", "q", "find"] as const) if (m[k]) qs.set(k, String(m[k]));
    if (m.by !== "none" && m.view === "answers") qs.set("by", m.by);
    if (m.n && m.view === "written") qs.set("n", String(m.n));
    return `${base}?${qs.toString()}`;
  };
  const rows = filterRows(all, p);
  const filtered = !!(p.age || p.state || p.level);
  const states = [...new Set(all.map((r) => r.state).filter(Boolean) as string[])].sort();
  const noAge = all.filter((r) => !r.age).length, noState = all.filter((r) => !r.state).length;

  const sub = (
    <nav className="in-sub" aria-label="Insights views">
      {([["answers", "data", "Answers"], ["written", "tasks", "Written answers"], ["trends", "clock", "Trends"]] as const).map(([k, i, l]) => (
        <Link key={k} href={href({ view: k })} className="c-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
          aria-current={p.view === k ? "page" : undefined}>
          <Icon name={i} size={16} />{l}
        </Link>
      ))}
    </nav>
  );

  if (all.length === 0) {
    return <>{sub}<div className="c-card"><p className="c-sub" style={{ margin: 0 }}>Insights appear here as responses are approved.</p></div></>;
  }

  const filters = (
    <form method="get" action={base} className="c-card in-filters" aria-label="Filters">
      <input type="hidden" name="tab" value="insights" />
      <input type="hidden" name="view" value={p.view} />
      {p.q && <input type="hidden" name="q" value={p.q} />}
      <div className="c-field">
        <label className="c-label" htmlFor="in-age">Age</label>
        <select id="in-age" name="age" className="c-input" defaultValue={p.age ?? ""} style={{ minHeight: 44 }}>
          <option value="">Any age</option>{AGE_BANDS.map((b) => <option key={b.label}>{b.label}</option>)}
        </select>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="in-state">State</label>
        <select id="in-state" name="state" className="c-input" defaultValue={p.state ?? ""} style={{ minHeight: 44 }}>
          <option value="">Any state</option>{states.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="c-field">
        <label className="c-label" htmlFor="in-level">Doer level</label>
        <select id="in-level" name="level" className="c-input" defaultValue={p.level ?? ""} style={{ minHeight: 44 }}>
          <option value="">Any level</option>{LEVELS.map((l) => <option key={l} value={l}>Level {l}</option>)}
        </select>
      </div>
      {p.view === "answers" && (
        <div className="c-field">
          <label className="c-label" htmlFor="in-by">Compare by</label>
          <select id="in-by" name="by" className="c-input" defaultValue={p.by} style={{ minHeight: 44 }}>
            <option value="none">Nobody</option><option value="age">Age</option><option value="area">State</option><option value="level">Doer level</option>
          </select>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="c-btn c-btn-primary" style={{ minHeight: 44 }}>Apply</button>
        {(filtered || p.by !== "none") && <Link href={href({ age: undefined, state: undefined, level: undefined, by: "none" })} className="c-link">Clear</Link>}
      </div>
    </form>
  );

  const showing = (
    <p className="c-small" style={{ margin: 0 }}>
      Showing {filtered ? `${rows.length} of ${all.length}` : `all ${all.length}`} approved response{all.length === 1 ? "" : "s"}.
      {(p.age || p.by === "age") && noAge > 0 && ` ${noAge} ${noAge === 1 ? "person hasn’t" : "people haven’t"} added a date of birth yet, so they’re left out of age groups.`}
      {(p.state || p.by === "area") && noState > 0 && ` ${noState} ${noState === 1 ? "person hasn’t" : "people haven’t"} added where they live yet.`}
    </p>
  );

  const tooFew = filtered && rows.length < MIN_GROUP;
  const privacy = (
    <section className="c-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span className="c-ico" style={{ background: "var(--c-violet-soft)", color: "var(--c-violet-text)" }}><Icon name="lock" size={18} /></span>
      <span className="c-small" style={{ color: "#3A3A35", flex: 1 }}>Groups with fewer than {MIN_GROUP} people are hidden, so no one can be picked out. Age and area come from doers&rsquo; profiles; names and contact details are never shown.</span>
    </section>
  );
  const hidden = <div className="c-card"><p className="c-sub" style={{ margin: 0 }}>Fewer than {MIN_GROUP} people match these filters, so the results are hidden to protect their privacy. Try a wider filter.</p></div>;

  // ---------------- Written answers ----------------
  if (p.view === "written") {
    const texts = questions.filter(isText);
    const q = texts.find((x) => x.id === p.q) ?? texts[0];
    const find = (p.find ?? "").trim().toLowerCase();
    const list = q ? rows.filter((r) => has(r.answers?.[q.id])).map((r) => ({ at: r.at, text: String(r.answers![q.id]) }))
      .filter((x) => !find || x.text.toLowerCase().includes(find)).sort((a, b) => b.at.localeCompare(a.at)) : [];
    const n = Math.max(50, p.n ?? 50);
    return (
      <>
        {sub}{filters}{showing}
        {!q ? <div className="c-card"><p className="c-sub" style={{ margin: 0 }}>This task has no written-answer questions.</p></div> : tooFew ? hidden : (
          <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <form method="get" action={base} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="hidden" name="tab" value="insights" /><input type="hidden" name="view" value="written" />
              {p.age && <input type="hidden" name="age" value={p.age} />}{p.state && <input type="hidden" name="state" value={p.state} />}{p.level && <input type="hidden" name="level" value={p.level} />}
              {texts.length > 1 && (
                <select name="q" className="c-input" defaultValue={q.id} aria-label="Question" style={{ minHeight: 44, flex: "1 1 240px", fontSize: 15 }}>
                  {texts.map((t) => <option key={t.id} value={t.id}>Question {questions.indexOf(t) + 1}: {t.label.slice(0, 60)}</option>)}
                </select>
              )}
              {texts.length === 1 && <input type="hidden" name="q" value={q.id} />}
              <input name="find" defaultValue={p.find ?? ""} className="c-input" placeholder="Find a word, like price" aria-label="Find in answers" style={{ minHeight: 44, flex: "1 1 200px" }} />
              <button className="c-btn c-btn-quiet" style={{ minHeight: 44 }}><Icon name="search" size={16} /> Find</button>
            </form>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="c-small">Question {questions.indexOf(q) + 1} · {list.length} answer{list.length === 1 ? "" : "s"}{find ? ` with “${p.find}”` : ""}</span>
              <strong style={{ fontSize: 17 }}>{q.label}</strong>
            </div>
            {list.length === 0 && <p className="c-sub" style={{ margin: 0 }}>No answers{find ? " with that word" : " yet"}.</p>}
            {list.slice(0, n).map((x, i) => <p key={i} className="in-quote">{x.text}</p>)}
            {list.length > n && <Link href={href({ n: n + 100 })} className="c-btn c-btn-quiet" style={{ alignSelf: "flex-start" }}>Show more ({list.length - n} left)</Link>}
          </section>
        )}
        <section className="c-card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span className="c-ico" style={{ background: "var(--c-violet-soft)", color: "var(--c-violet-text)" }}><Icon name="spark" size={18} /></span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <strong>Coming in Insights Plus</strong>
            <span className="c-small">The main themes in written answers pulled out for you, with how many people said each one and example quotes.</span>
          </span>
        </section>
      </>
    );
  }

  // ---------------- Trends ----------------
  if (p.view === "trends") {
    if (tooFew) return <>{sub}{filters}{showing}{hidden}</>;
    const keys = rows.map((r) => dayKey(r.at)).sort();
    const days: string[] = [];
    if (keys.length) {
      for (let d = new Date(keys[0] + "T12:00:00Z"); dayKey(d.toISOString()) <= keys[keys.length - 1]; d = new Date(d.getTime() + 86400_000)) days.push(dayKey(d.toISOString()));
    }
    const shown = days.slice(-60);
    const per = shown.map((d) => keys.filter((k) => k === d).length);
    const max = Math.max(1, ...per);
    const choices = questions.filter(isChoice);
    const q = choices.find((x) => x.id === p.q) ?? choices[0];
    return (
      <>
        {sub}{filters}{showing}
        <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="c-small">Responses{days.length > 60 ? " · last 60 days" : ""}</span>
            <strong style={{ fontSize: 17 }}>New responses each day</strong>
          </div>
          <div className="in-days" role="img" aria-label={`Responses per day: ${shown.map((d, i) => `${dayLabel(d, true)} ${per[i]}`).join(", ")}`}>
            {per.map((n, i) => <span key={shown[i]} title={`${dayLabel(shown[i], true)}: ${n}`} style={{ height: `${Math.max(n ? 4 : 1, (n / max) * 100)}%`, opacity: n ? 1 : 0.25 }} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="c-small">
            <span>{shown.length ? dayLabel(shown[0], true) : ""}</span><span>Busiest day: {max} response{max === 1 ? "" : "s"}</span><span>{shown.length ? dayLabel(shown[shown.length - 1], true) : ""}</span>
          </div>
          {slots > all.length && per.length >= 3 && (() => {
            const recent = per.slice(-7), avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            return avg > 0 ? <p className="c-small" style={{ margin: 0, color: "#3A3A35" }}>At the pace of the last {recent.length} days (about {avg < 1 ? avg.toFixed(1) : Math.round(avg)} a day), the last {slots - all.length} slot{slots - all.length === 1 ? "" : "s"} fill in about {Math.ceil((slots - all.length) / avg)} day{Math.ceil((slots - all.length) / avg) === 1 ? "" : "s"}.</p> : null;
          })()}
        </section>
        {q && <ShareOverTime question={q} qNumber={questions.indexOf(q) + 1} choices={choices} questions={questions} rows={rows} days={shown} p={p} base={base} />}
      </>
    );
  }

  // ---------------- Answers ----------------
  const secs = rows.map((r) => r.seconds).filter((s): s is number => !!s).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : null;
  const groups = p.by === "none" ? [] : (() => {
    const m = new Map<string, InsightRow[]>();
    for (const r of rows) { const k = groupKey(r, p.by); if (k) m.set(k, [...(m.get(k) ?? []), r]); }
    const order = p.by === "age" ? AGE_BANDS.map((b) => b.label) : p.by === "level" ? ["Level 1 to 2", "Level 3", "Level 4 to 5"] : null;
    const list = [...m.entries()].map(([k, v]) => ({ k, rows: v }));
    if (order) list.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)); else list.sort((a, b) => b.rows.length - a.rows.length);
    return list;
  })();
  const shownGroups = groups.filter((g) => g.rows.length >= MIN_GROUP).slice(0, 4);
  const hiddenGroups = groups.filter((g) => !shownGroups.includes(g));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {sub}
        <a href={exportHref} className="c-btn c-btn-quiet" style={{ minHeight: 40 }}><Icon name="download" size={16} /> Download answers (CSV)</a>
      </div>
      {filters}{showing}
      {tooFew ? hidden : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Stat label="Responses" value={String(rows.length)} note={filtered ? `of ${all.length} approved` : `approved, of ${slots} slots`} />
            <Stat label="Median time" value={median ? `${Math.max(1, Math.round(median / 60))} min` : "–"} note="per response" />
            {questions.some(isText) && <Stat label="Written answers" value={String(rows.filter((r) => questions.filter(isText).some((q) => has(r.answers?.[q.id]))).length)} note="people who wrote something" />}
          </div>
          {p.by !== "none" && shownGroups.length < 2 && (
            <div className="c-note" role="status"><Icon name="info" size={18} /><span>Not enough people in at least two {p.by === "area" ? "states" : p.by === "age" ? "age groups" : "level groups"} to compare yet. Each group needs {MIN_GROUP} or more.</span></div>
          )}
          {p.by !== "none" && shownGroups.length >= 2 && (
            <div className="c-card" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "12px 16px" }}>
              {shownGroups.map((g, i) => <span key={g.k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i], display: "inline-block" }} />{g.k} <span className="c-small">({g.rows.length})</span></span>)}
              {hiddenGroups.length > 0 && <span className="c-small">Hidden: {hiddenGroups.map((g) => g.k).join(", ")}{hiddenGroups.some((g) => g.rows.length < MIN_GROUP) ? ` (fewer than ${MIN_GROUP}` + (groups.length > 4 ? " or not in the top 4)" : ")") : ""}</span>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14, alignItems: "start" }}>
            {questions.map((q, i) => (
              <QuestionCard key={q.id} q={q} n={i + 1} rows={rows} groups={p.by !== "none" && shownGroups.length >= 2 ? shownGroups : []}
                writtenHref={href({ view: "written", q: q.id })} />
            ))}
          </div>
        </>
      )}
      {privacy}
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="c-card" style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
      <span className="c-small">{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</span>
      <span className="c-small" style={{ fontSize: 12 }}>{note}</span>
    </div>
  );
}

function QuestionCard({ q, n, rows, groups, writtenHref }: { q: Question; n: number; rows: InsightRow[]; groups: { k: string; rows: InsightRow[] }[]; writtenHref: string }) {
  const answered = rows.filter((r) => has(r.answers?.[q.id]));
  const kind = q.type === "single_choice" ? "one answer" : q.type === "multi_choice" ? "more than one answer" : q.type === "rating" ? "rating" : "written answer";
  let body: React.ReactNode;
  if (isChoice(q)) {
    const opts = (q.options ?? []).map((o) => ({ o, n: answered.filter((r) => picked(r.answers![q.id], o)).length })).sort((a, b) => b.n - a.n);
    if (groups.length) {
      body = opts.map(({ o }) => (
        <div key={o} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 14 }}>{o}</span>
          {groups.map((g, i) => {
            const ans = g.rows.filter((r) => has(r.answers?.[q.id]));
            const v = pct(ans.filter((r) => picked(r.answers![q.id], o)).length, ans.length);
            return (
              <span key={g.k} className="in-bar" aria-label={`${g.k}: ${v}%`}>
                <span className="c-bar" style={{ height: 8 }}><span style={{ width: `${v}%`, background: COLORS[i] }} /></span>
                <span style={{ fontSize: 12, fontWeight: 650, textAlign: "right" }}>{v}%</span>
              </span>
            );
          })}
        </div>
      ));
    } else {
      body = opts.map((c) => (
        <div key={c.o} className="in-bar">
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14 }}>{c.o}</span>
            <span className="c-bar"><span style={{ width: `${pct(c.n, answered.length)}%`, background: "var(--c-violet)" }} /></span>
          </span>
          <span style={{ fontWeight: 650, textAlign: "right" }}>{pct(c.n, answered.length)}% <span className="c-small" style={{ display: "block", fontWeight: 400 }}>{c.n}</span></span>
        </div>
      ));
    }
  } else if (q.type === "rating") {
    const scale = q.scale ?? 5;
    const avg = (rs: InsightRow[]) => {
      const nums = rs.map((r) => Number(r.answers?.[q.id])).filter((x) => x >= 1);
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    };
    if (groups.length) {
      body = groups.map((g, i) => (
        <div key={g.k} className="in-bar">
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14 }}>{g.k}</span>
            <span className="c-bar" style={{ height: 8 }}><span style={{ width: `${(avg(g.rows) / scale) * 100}%`, background: COLORS[i] }} /></span>
          </span>
          <span style={{ fontWeight: 650, textAlign: "right" }}>{avg(g.rows).toFixed(1)}</span>
        </div>
      ));
    } else {
      const counts = Array.from({ length: scale }, (_, i) => answered.filter((r) => Number(r.answers![q.id]) === i + 1).length);
      const max = Math.max(1, ...counts);
      body = (
        <>
          <span><strong style={{ fontSize: 24 }}>{avg(answered).toFixed(1)}</strong> <span className="c-small">average of {answered.length} (1 to {scale}{q.low && q.high ? `: ${q.low} to ${q.high}` : ""})</span></span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }} role="img" aria-label={counts.map((c, i) => `${i + 1}: ${pct(c, answered.length)}%`).join(", ")}>
            {counts.map((c, i) => (
              <span key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
                <span className="c-small" style={{ color: "var(--c-ink)", fontWeight: 650 }}>{pct(c, answered.length)}%</span>
                <span style={{ width: "100%", height: `${(c / max) * 70}%`, minHeight: 2, borderRadius: "6px 6px 3px 3px", background: i + 1 > scale / 2 ? "var(--c-violet)" : "#C9C3F5" }} />
                <span className="c-small">{i + 1}</span>
              </span>
            ))}
          </div>
        </>
      );
    }
  } else {
    const latest = answered.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
    body = (
      <>
        {latest.map((r, i) => <p key={i} className="in-quote">{String(r.answers![q.id])}</p>)}
        <Link href={writtenHref} className="c-link" style={{ alignSelf: "flex-start" }}>Read all {answered.length} answers</Link>
      </>
    );
  }
  return (
    <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="c-small">Question {n} · {kind}</span>
          <strong style={{ fontSize: 16 }}>{q.label}</strong>
        </span>
        <span className="c-small" style={{ whiteSpace: "nowrap" }}>{answered.length} answer{answered.length === 1 ? "" : "s"}</span>
      </div>
      {body}
      {q.type === "multi_choice" && !groups.length && <span className="c-small" style={{ fontSize: 12 }}>Adds up to more than 100% because people could pick several.</span>}
    </section>
  );
}

/** How the share of each answer moved as responses came in (share of everyone who had answered by that day). */
function ShareOverTime({ question: q, qNumber, choices, questions, rows, days, p, base }: {
  question: Question; qNumber: number; choices: Question[]; questions: Question[]; rows: InsightRow[]; days: string[]; p: InsightParams; base: string;
}) {
  const answered = rows.filter((r) => has(r.answers?.[q.id])).map((r) => ({ k: dayKey(r.at), v: r.answers![q.id] }));
  const top = (q.options ?? []).map((o) => ({ o, n: answered.filter((a) => picked(a.v, o)).length })).sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.o);
  const series = top.map((o) => days.map((d) => {
    const upto = answered.filter((a) => a.k <= d);
    return upto.length >= MIN_GROUP ? pct(upto.filter((a) => picked(a.v, o)).length, upto.length) : null;
  }));
  const W = 720, H = 220, L = 40, R = 16, T = 10, B = 28;
  const x = (i: number) => L + (days.length <= 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / 100);
  const step = Math.max(1, Math.ceil(days.length / 8));
  return (
    <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="c-small">Question {qNumber} · how answers changed</span>
          <strong style={{ fontSize: 17 }}>{q.label}</strong>
        </span>
        {choices.length > 1 && (
          <form method="get" action={base} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="tab" value="insights" /><input type="hidden" name="view" value="trends" />
            {p.age && <input type="hidden" name="age" value={p.age} />}{p.state && <input type="hidden" name="state" value={p.state} />}{p.level && <input type="hidden" name="level" value={p.level} />}
            <select name="q" className="c-input" defaultValue={q.id} aria-label="Question to follow" style={{ minHeight: 44, fontSize: 14, maxWidth: 280 }}>
              {choices.map((c) => <option key={c.id} value={c.id}>Question {questions.indexOf(c) + 1}: {c.label.slice(0, 40)}</option>)}
            </select>
            <button className="c-btn c-btn-quiet" style={{ minHeight: 44 }}>Show</button>
          </form>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {top.map((o, i) => <span key={o} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i], display: "inline-block" }} />{o}</span>)}
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Share of answers by day for question ${qNumber}`} style={{ display: "block", minWidth: 420 }}>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--c-line)" /><text x={L - 8} y={y(v) + 4} fontSize="11" fill="#6B6A64" textAnchor="end">{v}%</text></g>
          ))}
          {days.map((d, i) => (i % step === 0 || i === days.length - 1) && <text key={d} x={x(i)} y={H - 8} fontSize="11" fill="#6B6A64" textAnchor="middle">{dayLabel(d, i === 0 || d.endsWith("-01"))}</text>)}
          {series.map((s, si) => {
            const pts = s.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
            return (
              <g key={si}>
                <polyline points={pts} fill="none" stroke={COLORS[si]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={si === 2 ? "6 5" : undefined} />
                {days.length <= 31 && s.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={COLORS[si]} />)}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="c-small" style={{ margin: 0, color: "#3A3A35" }}>Share of everyone who had answered by that day. Days before the first {MIN_GROUP} answers are left blank.</p>
    </section>
  );
}
