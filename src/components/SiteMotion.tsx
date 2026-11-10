"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Scroll motion for getdoova.com (6 Nov). Blocks below the first screen rise in as they scroll into view,
// one after another within a section; line doodles draw themselves. Content that's already on screen
// is never hidden (no flicker), nothing happens without JavaScript, and nothing moves for people who
// ask their device for reduced motion. The hero's entrance is pure CSS (website.css).
const BLOCKS = [
  ".card", ".bento-tile", ".photo", ".phone", ".laptop", ".faq", ".help-card", ".cta-in", ".toast",
  ".stack > .eyebrow", ".stack > .h2", ".stack > .h3", ".stack > .lead", ".stack > .body", ".stack > .row", ".stack > .pill",
  ".g2 > *", ".g3 > *", ".g4 > *", ".tl-step",
].join(",");

export function SiteMotion() {
  const path = usePathname();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ws");
    if (!root || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hero = root.querySelector(".nav + .sec");
    const fold = window.innerHeight;
    const marked: HTMLElement[] = [];
    root.querySelectorAll<HTMLElement>(".sec").forEach((sec) => {
      if (sec === hero) return;
      sec.querySelectorAll<HTMLElement>(BLOCKS).forEach((el) => {
        if (el.parentElement?.closest("[data-rv]") || el.getBoundingClientRect().top < fold) return;
        el.dataset.rv = "";
        marked.push(el);
      });
    });
    // stagger siblings that arrive together
    const groups = new Map<Element | null, HTMLElement[]>();
    marked.forEach((el) => groups.set(el.parentElement, [...(groups.get(el.parentElement) ?? []), el]));
    groups.forEach((els) => els.forEach((el, i) => el.style.setProperty("--rv-d", `${Math.min(i, 6) * 90}ms`)));
    const draws = [...root.querySelectorAll<SVGElement>(".dd-squig, .dd-under, .dd-arrow, .dd-loop")].filter(
      (svg) => !hero?.contains(svg) && svg.getBoundingClientRect().top >= fold);
    draws.forEach((svg) => svg.classList.add("dd-draw"));
    root.classList.add("motion");

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("rv-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    marked.forEach((el) => io.observe(el));
    draws.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove("motion");
      marked.forEach((el) => { delete el.dataset.rv; el.classList.remove("rv-in"); });
      draws.forEach((el) => el.classList.remove("dd-draw", "rv-in"));
    };
  }, [path]);

  // Home's glow hero (10 Nov): the light on the coin follows the mouse; tapping the coin shows another example payment.
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".ws .hg");
    if (!hero) return;
    const JOBS: [string, number, number, number][] = [
      ["Label 50 street food photos", 800, 40000, 50], ["Your mobile money habits", 500, 25000, 50],
      ["Rate 5 snack advert ideas", 600, 24000, 40], ["Test a savings app sign-up", 1500, 45000, 30],
    ];
    const naira = (v: number) => "\u20A6" + v.toLocaleString("en-NG");
    let i = 0;
    const move = (e: MouseEvent) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    };
    const set = (k: string, v: string) => { const el = hero.querySelector(`[data-hg="${k}"]`); if (el) el.textContent = v; };
    const tap = () => {
      i = (i + 1) % JOBS.length;
      const [title, pay, total, people] = JOBS[i];
      set("lockTitle", `${naira(total)} for ${people} people`); set("lockSub", title); set("paid", "+" + naira(pay)); set("paidFor", title);
      hero.classList.remove("hg-tapped"); void hero.offsetWidth; hero.classList.add("hg-tapped");
    };
    const orb = hero.querySelector<HTMLButtonElement>("button.hg-orb");
    hero.addEventListener("mousemove", move);
    orb?.addEventListener("click", tap);
    return () => { hero.removeEventListener("mousemove", move); orb?.removeEventListener("click", tap); };
  }, [path]);
  return null;
}
