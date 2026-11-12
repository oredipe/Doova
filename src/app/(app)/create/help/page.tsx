import type { Metadata } from "next";
import { requireProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "Help" };

const QA: [string, string][] = [
  ["When do I pay?", "You add money to Creator funds, then lock the rewards for a task when you post it. Doers are paid only for work that passes your checks. Rewards for unfilled slots and rejected work come back when the task closes."],
  ["What is the 15% fee?", "Doova adds 15% on top of the rewards you lock. It covers payments, checks against fake accounts, and support. If Doova doesn't approve your task, everything comes back, fee included. If you close a task early, rewards for unused slots come back but the fee on them doesn't."],
  ["How long do I have to review?", "Each task has a review window you choose, up to 72 hours. Anything you don't decide in time is approved and paid automatically, so doers are never left waiting."],
  ["Can I reject a response?", "Yes, with a reason. The doer can appeal once and Doova staff decide within 24 hours."],
  ["Who sees my answers?", "Only you. Insights show group totals by age, area and doer level, and hide any group smaller than 5 people so no one can be singled out."],
];

export default async function CreatorHelp() {
  await requireProfile();
  return (
    <>
      <h1 className="c-title">Help</h1>
      <div className="c-group">
        {QA.map(([q, a]) => (
          <details key={q} className="c-row" style={{ display: "block" }}>
            <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: 16 }}>{q}</summary>
            <p className="c-sub" style={{ margin: "8px 0 0" }}>{a}</p>
          </details>
        ))}
      </div>
      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <strong>Still stuck?</strong>
        <span className="c-sub">Email <a href="mailto:hello@getdoova.com">hello@getdoova.com</a>. We reply within a working day.</span>
      </section>
    </>
  );
}
