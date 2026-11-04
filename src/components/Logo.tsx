import Link from "next/link";

/** The Doova lockup (all black on light grounds, 3 Nov logo decision). */
export function Logo({ href = "/", height = 24 }: { href?: string; height?: number }) {
  return (
    <Link href={href} aria-label="Doova home" style={{ display: "inline-flex" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny SVG, no optimisation needed */}
      <img src="/doova-lockup.svg" alt="Doova" height={height} style={{ height, width: "auto" }} />
    </Link>
  );
}
