import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";

type Section = { heading: string; body: string[] };
const DOCS: Record<string, { title: string; summary: string; sections?: Section[] }> = {
  terms: {
    title: "Terms of use",
    summary: "The full terms will be written with a lawyer before launch. The parts below already apply to every account.",
    sections: [{
      heading: "1. You must be 18 or older",
      body: [
        "Doova is only for people aged 18 and over. When you create an account you give your date of birth and confirm that you are 18 or older. By ticking that box you agree to these Terms and our Privacy policy.",
        "Your date of birth must be true and match your National Identification Number (NIN). We check it against your NIN before your first withdrawal, and we may check it at any time.",
        "If we find that an account belongs to someone under 18, or that the date of birth given is false, we close the account and deal with any balance as the law requires.",
      ],
    }],
  },
  privacy: { title: "Privacy policy", summary: "Placeholder summary. Doova collects only what it needs to pay you and keep accounts real, under Nigeria’s data protection law. The full policy will be written with a lawyer before launch." },
  rules: { title: "Community rules", summary: "Placeholder summary. No reason, no rejection; appeals within 48 hours; one person, one account." },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

// params are read inside Suspense so the page shell can be prerendered (cacheComponents).
export default function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  return <Suspense fallback={<div className="auth" />}><LegalDoc params={params} /></Suspense>;
}

async function LegalDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <div className="auth">
      <header className="auth-top"><Logo /><Link href="/" className="c-small" style={{ color: "var(--c-ink)" }}>Home</Link></header>
      <main className="auth-main">
        <h1 className="c-title">{d.title}</h1>
        <p className="c-sub">{d.summary}</p>
        {d.sections?.map((x) => (
          <section key={x.heading} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="c-h2">{x.heading}</h2>
            {x.body.map((b, i) => <p key={i} style={{ margin: 0, lineHeight: 1.6 }}>{b}</p>)}
          </section>
        ))}
      </main>
    </div>
  );
}
