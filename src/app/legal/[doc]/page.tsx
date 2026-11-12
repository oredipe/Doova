import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { BackLink } from "@/components/BackLink";
import { LEGAL, LEGAL_UPDATED, type Block } from "@/content/legal";

export function generateStaticParams() {
  return Object.keys(LEGAL).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: LEGAL[doc]?.title ?? "Legal" };
}

// "Card payments. Card payments are…" → bold lead-in, then the rest.
function Item({ text }: { text: string }) {
  const m = /^([A-Z][^.]{2,40}\.)\s(.+)$/.exec(text);
  const lead = m && !/\d/.test(m[1]) && m[1].split(" ").length <= 6 ? m : null;
  return <li>{lead ? <><strong>{lead[1]}</strong> {lead[2]}</> : text}</li>;
}

function Body({ b }: { b: Block }) {
  if ("p" in b) return <p>{b.p}</p>;
  if ("list" in b) return <ol>{b.list.map((t, i) => <Item key={i} text={t} />)}</ol>;
  return (
    <div className="legal-table">
      <table>
        <thead><tr>{b.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

// params are read inside Suspense so the page shell can be prerendered (cacheComponents).
export default function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  return <Suspense fallback={<div className="auth" />}><LegalDoc params={params} /></Suspense>;
}

async function LegalDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL[doc];
  if (!d) notFound();
  return (
    <div className="auth">
      <header className="auth-top"><Logo /><Link href="/" className="c-small" style={{ color: "var(--c-ink)" }}>Home</Link></header>
      <main className="legal">
        <BackLink />
        <nav className="legal-tabs" aria-label="Legal documents">
          {Object.values(LEGAL).map((x) => (
            <Link key={x.slug} href={`/legal/${x.slug}`} aria-current={x.slug === d.slug ? "page" : undefined}>{x.title}</Link>
          ))}
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="c-title">{d.title}</h1>
          <p className="c-small" style={{ margin: 0 }}>Last updated {LEGAL_UPDATED}</p>
        </div>
        <div className="c-note" role="note">
          <span>This is the version for our pilot. A lawyer is reviewing it, and we&rsquo;ll tell you in the app before the final version takes effect.</span>
        </div>
        <p className="legal-intro">{d.intro}</p>
        {d.sections.map((s) => (
          <section key={s.heading} className="legal-sec">
            <h2 className="c-h2">{s.heading}</h2>
            {s.blocks.map((b, i) => <Body key={i} b={b} />)}
          </section>
        ))}
      </main>
    </div>
  );
}
