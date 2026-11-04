import type { Metadata } from "next";
import { SiteHtml } from "@/components/SiteHtml";
import { parts } from "@/site/creators";
import { CostCalculator } from "./CostCalculator";

export const metadata: Metadata = {
  title: "For creators",
  description: "Real answers from real Nigerians, in days. Post a survey, app test or labelling job; pay only for work that passes your checks. 15% on top, nothing hidden.",
};

// The page is the canvas export in three pieces, with the live cost calculator in the pricing section.
export default function CreatorsPage() {
  return (
    <>
      <SiteHtml html={parts[0]} />
      <section className="sec" id="calc">
        <div className="wrap split">
          <SiteHtml html={parts[1]} />
          <CostCalculator />
        </div>
      </section>
      <SiteHtml html={parts[2]} />
    </>
  );
}
