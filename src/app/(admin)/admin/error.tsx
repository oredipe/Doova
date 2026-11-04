"use client";
// Shown when an admin page fails. The reference (digest) matches the error in Vercel's logs.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ad-body">
      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
        <h1 className="c-h1">This admin page didn&rsquo;t load</h1>
        <p className="c-sub">Try again. If it keeps happening, send the developer the reference below.</p>
        <code style={{ fontSize: 13, overflowWrap: "anywhere" }}>{error.digest ? `Reference: ${error.digest}` : error.message}</code>
        <button className="c-btn c-btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => reset()}>Try again</button>
      </section>
    </div>
  );
}
