"use client";
import Link from "next/link";
import { useState } from "react";
import { calcArrow } from "@/site/calc-arrow";

// "What will it cost?" on the For creators page: reward × people, plus Doova's 15%.
const REWARDS = [500, 800, 1000, 1500];
const PEOPLE = [50, 150, 300, 1000];
const naira = (v: number) => "₦" + v.toLocaleString("en-NG");

export function CostCalculator() {
  const [reward, setReward] = useState(800);
  const [people, setPeople] = useState(150);
  const sub = reward * people;
  const fee = Math.round(sub * 0.15);

  return (
    <div className="card stack" style={{ gap: 20, position: "relative" }}>
      <div aria-hidden="true" style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: calcArrow }} />
      <span className="h3">What will it cost?</span>
      <div className="stack" style={{ gap: 10 }}>
        <span className="small" style={{ color: "#111", fontWeight: 650 }} id="calc-reward">Reward for each person</span>
        <div className="row" style={{ gap: 8 }} role="group" aria-labelledby="calc-reward">
          {REWARDS.map((r) => (
            <button key={r} type="button" className="tab tab-chip" aria-pressed={reward === r} onClick={() => setReward(r)}>{naira(r)}</button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <span className="small" style={{ color: "#111", fontWeight: 650 }} id="calc-people">How many people</span>
        <div className="row" style={{ gap: 8 }} role="group" aria-labelledby="calc-people">
          {PEOPLE.map((n) => (
            <button key={n} type="button" className="tab tab-chip" aria-pressed={people === n} onClick={() => setPeople(n)}>
              {n.toLocaleString("en-NG")} people
            </button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 8, paddingTop: 16, borderTop: "1px solid rgba(17,17,17,0.1)" }} aria-live="polite">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="body">{people.toLocaleString("en-NG")} × {naira(reward)}</span>
          <span style={{ fontWeight: 650 }}>{naira(sub)}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="body">Doova fee (15%)</span>
          <span style={{ fontWeight: 650 }}>{naira(fee)}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", paddingTop: 8 }}>
          <span style={{ fontWeight: 650 }}>Total</span>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em" }}>{naira(sub + fee)}</span>
        </div>
      </div>
      <Link href="/sign-up" className="btn btn-dark">Post this task</Link>
    </div>
  );
}
