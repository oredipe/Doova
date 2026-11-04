"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import type { Question } from "@/lib/tasks";
import { createTask, type Draft } from "./actions";

// Post a task in 4 steps (3 Nov): what kind; title, instructions and questions;
// time, reward, slots and checking; review the cost. Saved unfunded, then funded on the next screen.

type Kind = Draft["kind"];
type Q = Question & { key: number };

const KINDS: { kind: Kind; title: string; text: string; reviewMode: "auto" | "manual" }[] = [
  { kind: "survey", title: "Survey", text: "Ask questions and collect answers. Paid automatically when checks pass.", reviewMode: "auto" },
  { kind: "review", title: "Quick review", text: "People rate or compare ideas, adverts, names or designs.", reviewMode: "auto" },
  { kind: "labelling", title: "Labelling", text: "People sort or describe items you give them. Doers at Level 2 and up.", reviewMode: "manual" },
];
const TYPES: { type: Question["type"]; label: string }[] = [
  { type: "single_choice", label: "One choice" }, { type: "multi_choice", label: "Several choices" },
  { type: "rating", label: "Rating 1–5" }, { type: "short_text", label: "Short answer" }, { type: "long_text", label: "Written answer" },
];
const STEPS = ["Kind", "Questions", "Reward and slots", "Review"];
const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
const fee = (rewardKobo: number) => Math.floor((rewardKobo * 1500 + 9999) / 10000);
let nextKey = 1;
const newQ = (type: Question["type"]): Q => ({
  key: nextKey++, id: "", type, label: "", required: true,
  options: type === "single_choice" || type === "multi_choice" ? ["", ""] : undefined,
  min_length: type === "long_text" ? 30 : undefined,
});
const levelFor = (reward: number) => (reward <= 1500 ? 1 : reward <= 3000 ? 2 : reward <= 5000 ? 3 : reward <= 10000 ? 4 : 5);

function QuestionEditor({ q, n, total, onChange, onMove, onRemove }: {
  q: Q; n: number; total: number; onChange: (q: Q) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const isChoice = q.type === "single_choice" || q.type === "multi_choice";
  const opts = q.options ?? [];
  return (
    <div className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ flex: 1 }}>Question {n} · {TYPES.find((t) => t.type === q.type)?.label}</strong>
        <button type="button" className="c-ic-btn" aria-label="Move up" disabled={n === 1} onClick={() => onMove(-1)}><Icon name="up" size={16} /></button>
        <button type="button" className="c-ic-btn" aria-label="Move down" disabled={n === total} onClick={() => onMove(1)}><Icon name="down" size={16} /></button>
        <button type="button" className="c-ic-btn" aria-label={`Delete question ${n}`} disabled={total === 1} onClick={onRemove}><Icon name="trash" size={16} /></button>
      </div>
      <input className="c-input" placeholder="Type the question" value={q.label} maxLength={300} aria-label={`Question ${n}`}
        onChange={(e) => onChange({ ...q, label: e.target.value })} />
      {isChoice && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opts.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <input className="c-input" value={o} placeholder={`Option ${i + 1}`} maxLength={120} aria-label={`Option ${i + 1}`}
                onChange={(e) => { const next = opts.slice(); next[i] = e.target.value; onChange({ ...q, options: next, check: q.check && q.check.answer === o ? { answer: e.target.value } : q.check }); }} />
              {opts.length > 2 && (
                <button type="button" className="c-ic-btn" aria-label={`Remove option ${i + 1}`} onClick={() => onChange({ ...q, options: opts.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
              )}
            </div>
          ))}
          {opts.length < 12 && <button type="button" className="c-link" onClick={() => onChange({ ...q, options: [...opts, ""] })}>Add an option</button>}
        </div>
      )}
      {q.type === "rating" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input className="c-input" placeholder="1 means… (e.g. Poor)" value={q.low ?? ""} maxLength={40} onChange={(e) => onChange({ ...q, low: e.target.value })} aria-label="What 1 means" />
          <input className="c-input" placeholder="5 means… (e.g. Great)" value={q.high ?? ""} maxLength={40} onChange={(e) => onChange({ ...q, high: e.target.value })} aria-label="What 5 means" />
        </div>
      )}
      {q.type === "long_text" && (
        <label className="c-small" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          At least
          <input className="c-input" type="number" min={0} max={1000} value={q.min_length ?? 0} style={{ width: 96, minHeight: 44 }}
            onChange={(e) => onChange({ ...q, min_length: Number(e.target.value) })} />
          characters
        </label>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <label className="c-small" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--c-ink)" }}>
          <input type="checkbox" checked={q.required !== false} onChange={(e) => onChange({ ...q, required: e.target.checked })} style={{ width: 18, height: 18, accentColor: "#111" }} />
          Must be answered
        </label>
        {q.type === "single_choice" && (
          <label className="c-small" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--c-ink)" }}>
            <input type="checkbox" checked={!!q.check} style={{ width: 18, height: 18, accentColor: "#111" }}
              onChange={(e) => onChange({ ...q, check: e.target.checked ? { answer: opts.find(Boolean) ?? "" } : undefined })} />
            Attention check
          </label>
        )}
      </div>
      {q.check && (
        <label className="c-field">
          <span className="c-small">The one right answer (people who choose anything else fail the check)</span>
          <select className="c-input" value={q.check.answer} onChange={(e) => onChange({ ...q, check: { answer: e.target.value } })}>
            {opts.filter(Boolean).map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function Chips<T extends number>({ values, value, onPick, fmt, label }: { values: T[]; value: number; onPick: (v: T) => void; fmt: (v: T) => string; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {values.map((v) => (
        <button key={v} type="button" className="c-chip" aria-pressed={value === v} onClick={() => onPick(v)}>{fmt(v)}</button>
      ))}
    </div>
  );
}

export function PostWizard({ maxSlots }: { maxSlots: number }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("survey");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<Q[]>(() => [newQ("single_choice")]);
  const [est, setEst] = useState(5);
  const [attempt, setAttempt] = useState(25);
  const [reward, setReward] = useState(800);
  const [slots, setSlots] = useState(Math.min(150, maxSlots));
  const [reviewMode, setReviewMode] = useState<"auto" | "manual">("auto");
  const [hours, setHours] = useState(24);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const rewardsKobo = reward * 100 * slots;
  const feeK = fee(rewardsKobo);
  const minAttempt = Math.max(15, 2 * est);

  function stepError(s: number): string | null {
    if (s === 1) {
      if (title.trim().length < 5) return "Give the task a title of at least 5 characters.";
      if (instructions.trim().length < 20) return "Write instructions of at least 20 characters, so people know what to do.";
      for (const [i, q] of questions.entries()) {
        if (q.label.trim().length < 3) return `Question ${i + 1} needs some words.`;
        if (q.options && q.options.filter((o) => o.trim()).length < 2) return `Question ${i + 1} needs at least 2 options.`;
      }
    }
    if (s === 2) {
      if (!(est >= 1 && est <= 180)) return "The task should take 1 to 180 minutes.";
      if (attempt < minAttempt) return `Give people at least ${minAttempt} minutes to finish.`;
      if (!(reward >= 500 && reward <= 500000)) return "The reward must be ₦500 to ₦500,000.";
      if (!(slots >= 5 && slots <= maxSlots)) return `Choose 5 to ${maxSlots.toLocaleString("en-NG")} slots.`;
    }
    return null;
  }
  function next() {
    const e = stepError(step);
    setError(e);
    if (!e) { setStep(step + 1); window.scrollTo(0, 0); }
  }
  function save() {
    setError(null);
    start(async () => {
      const res = await createTask({
        kind, title, instructions, estimatedMinutes: est, attemptMinutes: attempt, rewardNaira: reward, slots,
        reviewMode, reviewHours: hours, closesInDays: days,
        questions: questions.map((q) => ({ ...q, options: q.options?.filter((o) => o.trim()) })),
      });
      if (res?.error) setError(res.error);
    });
  }
  const setQ = (i: number, q: Q) => setQuestions((qs) => qs.map((x, j) => (j === i ? q : x)));
  const move = (i: number, d: -1 | 1) => setQuestions((qs) => { const n = qs.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="c-small">Step {step + 1} of 4 · {STEPS[step]}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }} aria-hidden="true">
          {STEPS.map((s, i) => <span key={s} style={{ height: 6, borderRadius: 999, background: i <= step ? "var(--c-violet)" : "var(--c-line)" }} />)}
        </div>
        <h1 className="c-title">{["What kind of task?", "Title, instructions and questions", "Time, reward and slots", "Check and fund"][step]}</h1>
      </div>

      {step === 0 && (
        <div role="radiogroup" aria-label="Kind of task" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="radio" className="c-radio" aria-checked={kind === k.kind}
              onClick={() => { setKind(k.kind); setReviewMode(k.reviewMode); }}>
              <span className="c-radio-dot" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 650 }}>{k.title}</span>
                <span className="c-small">{k.text}</span>
              </span>
            </button>
          ))}
          <div className="c-radio" style={{ opacity: 0.55, cursor: "default" }} aria-disabled="true">
            <span className="c-radio-dot" />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 650 }}>App or website test</span>
              <span className="c-small">Coming soon</span>
            </span>
          </div>
        </div>
      )}

      {step === 1 && (
        <>
          <div className="c-field">
            <label className="c-label" htmlFor="t-title">Title</label>
            <input id="t-title" className="c-input" value={title} maxLength={80} placeholder="e.g. Your mobile money habits" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="c-field">
            <label className="c-label" htmlFor="t-ins">Instructions</label>
            <textarea id="t-ins" className="c-input" rows={4} maxLength={1000} value={instructions} style={{ padding: 14, lineHeight: 1.5 }}
              placeholder="What should people do, and what makes a good answer?" onChange={(e) => setInstructions(e.target.value)} />
          </div>
          {questions.map((q, i) => (
            <QuestionEditor key={q.key} q={q} n={i + 1} total={questions.length} onChange={(x) => setQ(i, x)}
              onMove={(d) => move(i, d)} onRemove={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} />
          ))}
          {questions.length < 40 && (
            <div className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="c-label">Add a question</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TYPES.map((t) => <button key={t.type} type="button" className="c-chip" onClick={() => setQuestions((qs) => [...qs, newQ(t.type)])}>+ {t.label}</button>)}
              </div>
              {!questions.some((q) => q.check) && (
                <span className="c-small">Tip: add a one-choice question with a single right answer and tick &ldquo;Attention check&rdquo;, so careless answers aren&rsquo;t paid automatically.</span>
              )}
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="c-field">
            <label className="c-label" htmlFor="t-est">How many minutes does it take?</label>
            <input id="t-est" className="c-input" type="number" min={1} max={180} value={est}
              onChange={(e) => { const v = Number(e.target.value); setEst(v); setAttempt(Math.max(15, 5 * v)); }} />
            <span className="c-small">Be honest: people rate creators on this. We give each person {Math.max(15, 5 * est)} minutes to finish (you can change it below).</span>
          </div>
          <div className="c-field">
            <span className="c-label">Reward for each person</span>
            <Chips label="Suggested rewards" values={[500, 800, 1000, 1500]} value={reward} onPick={setReward} fmt={naira} />
            <input className="c-input" type="number" min={500} max={500000} value={reward} aria-label="Reward in naira" onChange={(e) => setReward(Number(e.target.value))} />
            {levelFor(reward) > 1 && <span className="c-small">Rewards above {naira([0, 1500, 3000, 5000, 10000][levelFor(reward) - 1])} are seen by Level {levelFor(reward)} doers and up, so fewer people can take it.</span>}
          </div>
          <div className="c-field">
            <span className="c-label">How many people (slots)</span>
            <Chips label="Suggested slots" values={[50, 150, 300, 1000].filter((v) => v <= maxSlots)} value={slots} onPick={setSlots} fmt={(v) => v.toLocaleString("en-NG")} />
            <input className="c-input" type="number" min={5} max={maxSlots} value={slots} aria-label="Slots" onChange={(e) => setSlots(Number(e.target.value))} />
            <span className="c-small">5 to {maxSlots.toLocaleString("en-NG")} for your tier.</span>
          </div>
          <div className="c-field">
            <span className="c-label">Checking responses</span>
            <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" role="radio" className="c-radio" aria-checked={reviewMode === "auto"} onClick={() => setReviewMode("auto")}>
                <span className="c-radio-dot" /><span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 650 }}>Pay automatically when checks pass</span>
                  <span className="c-small">Attention checks, not too fast, no copied answers. Anything that fails comes to you to decide.</span></span>
              </button>
              <button type="button" role="radio" className="c-radio" aria-checked={reviewMode === "manual"} onClick={() => setReviewMode("manual")}>
                <span className="c-radio-dot" /><span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 650 }}>I review every response</span>
                  <span className="c-small">You approve or reject each one with a reason.</span></span>
              </button>
            </div>
            <span className="c-small" style={{ marginTop: 6 }}>Responses you don&rsquo;t decide on within</span>
            <Chips label="Review window" values={[24, 48, 72]} value={hours} onPick={setHours} fmt={(v) => `${v} hours`} />
            <span className="c-small">are approved and paid automatically.</span>
          </div>
          <div className="c-field">
            <label className="c-label" htmlFor="t-att">Time each person has</label>
            <input id="t-att" className="c-input" type="number" min={minAttempt} max={1440} value={attempt} onChange={(e) => setAttempt(Number(e.target.value))} />
            <span className="c-small">At least {minAttempt} minutes (twice your estimate, never under 15). Their slot is held while they work.</span>
          </div>
          <div className="c-field">
            <span className="c-label">Task closes in</span>
            <Chips label="Closes in" values={[3, 7, 14, 30]} value={days} onPick={setDays} fmt={(v) => `${v} days`} />
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="c-small">{KINDS.find((k) => k.kind === kind)?.title} · {questions.length} question{questions.length === 1 ? "" : "s"} · about {est} min</span>
            <strong style={{ fontSize: 18 }}>{title}</strong>
            <span className="c-small">{reviewMode === "auto" ? "Paid automatically when checks pass" : "You review every response"} · closes in {days} days</span>
          </section>
          <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span className="c-sub">{slots.toLocaleString("en-NG")} × {naira(reward)}</span><strong>{naira(rewardsKobo / 100)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span className="c-sub">Doova fee (15%)</span><strong>{naira(feeK / 100)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--c-line)", paddingTop: 10 }}>
              <span style={{ fontWeight: 650 }}>Total</span><span style={{ fontSize: 30, fontWeight: 700 }}>{naira((rewardsKobo + feeK) / 100)}</span>
            </div>
            <span className="c-small">Rewards for unfilled slots and rejected work come back to your wallet when the task closes. The fee isn&rsquo;t refunded for unused slots.</span>
          </section>
          <div className="c-note"><Icon name="info" size={18} /><span>During the pilot, Doova checks every task before it goes live, usually within 4 hours.</span></div>
        </>
      )}

      {error && <p className="c-error" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        {step > 0 && <button type="button" className="c-btn c-btn-quiet" onClick={() => { setError(null); setStep(step - 1); }}>Back</button>}
        {step < 3
          ? <button type="button" className="c-btn c-btn-primary" style={{ flex: 1 }} onClick={next}>Continue</button>
          : <button type="button" className="c-btn c-btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save and fund"}</button>}
      </div>
    </div>
  );
}
