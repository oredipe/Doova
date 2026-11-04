/** Photo panel beside the sign-up and sign-in forms on laptops (hidden on phones), as on the website design. */
export function AuthPhoto({ src, alt, position = "50% 40%", toast }: { src: string; alt: string; position?: string; toast?: { big: string; line: string } }) {
  return (
    <div className="auth-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- already optimised WebP */}
      <img src={src} alt={alt} style={{ objectPosition: position }} />
      {toast && (
        <div className="auth-toast" aria-hidden="true">
          <span className="auth-toast-coin">₦</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{toast.big}</span>
            <span className="c-small">{toast.line}</span>
          </span>
        </div>
      )}
    </div>
  );
}
