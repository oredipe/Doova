import "./website.css";
import { SiteMotion } from "@/components/SiteMotion";

// getdoova.com marketing pages. The pages themselves are exported from the design canvas.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ws" style={{ width: "100%", minHeight: "100dvh" }}>
      {children}
      <SiteMotion />
    </div>
  );
}
