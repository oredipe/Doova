import { Icon } from "@/components/Icon";

/** Shown while the Supabase keys are not set yet (fresh Vercel project or local copy). */
export function SetupNeeded() {
  return (
    <div className="c-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="empty-art" style={{ marginBottom: 0 }}><Icon name="info" size={28} /></span>
      <h1 className="c-h2">Almost ready</h1>
      <p className="c-sub">
        Doova isn&rsquo;t connected to its database yet. Add the Supabase keys to this project&rsquo;s
        environment variables (see the README), then redeploy.
      </p>
    </div>
  );
}
