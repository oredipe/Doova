import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";

const DOCS: Record<string, { title: string; summary: string }> = {
  terms: { title: "Terms of use", summary: "Placeholder summary. The full terms will be written with a lawyer before launch." },
  privacy: { title: "Privacy policy", summary: "Placeholder summary. Doova collects only what it needs to pay you and keep accounts real, under Nigeria’s data protection law. The full policy will be written with a lawyer before launch." },
  rules: { title: "Community rules", summary: "Placeholder summary. No reason, no rejection; appeals within 48 hours; one person, one account." },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <div className="auth">
      <header className="auth-top"><Logo /><Link href="/" className="c-small" style={{ color: "var(--c-ink)" }}>Home</Link></header>
      <main className="auth-main">
        <h1 className="c-title">{d.title}</h1>
        <p className="c-sub">{d.summary}</p>
      </main>
    </div>
  );
}
