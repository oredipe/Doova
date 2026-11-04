"use client";
// Last-resort error screen (when even a layout fails). The reference matches Vercel's logs.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F6F6F1", color: "#111", padding: 24 }}>
        <div style={{ maxWidth: 520, margin: "60px auto", background: "#fff", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: "#6B6A64" }}>Try again. If it keeps happening, send the developer the reference below.</p>
          <code style={{ fontSize: 13, overflowWrap: "anywhere" }}>{error.digest ? `Reference: ${error.digest}` : error.message}</code>
          <button onClick={() => reset()} style={{ alignSelf: "flex-start", minHeight: 44, padding: "0 18px", borderRadius: 999, border: 0, background: "#111", color: "#fff", fontWeight: 600 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
