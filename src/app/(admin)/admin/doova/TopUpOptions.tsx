"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";

type IconName = Parameters<typeof Icon>[0]["name"];
export type TopUpOption = { id: string; title: string; sub: string; icon: IconName; tag?: string; quietTag?: boolean; panel: React.ReactNode };

/** Ways to add money to the Doova budget, as a short list of choices. Only the chosen one opens. */
export function TopUpOptions({ options }: { options: TopUpOption[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="c-card" style={{ padding: "18px 18px 6px" }}>
      <h2 className="c-h2" style={{ fontSize: 17 }}>Add money to the budget</h2>
      <p className="c-small" style={{ margin: "4px 0 8px" }}>Choose one way. You only need one.</p>
      <div>
        {options.map((o, i) => {
          const isOpen = open === o.id;
          return (
            <div key={o.id} style={{ borderTop: i ? "1px solid var(--c-line)" : undefined }}>
              <button type="button" aria-expanded={isOpen} aria-controls={`topup-${o.id}`} onClick={() => setOpen(isOpen ? null : o.id)}
                style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 0", cursor: "pointer", minHeight: 44 }}>
                <span className="c-ico" style={{ background: isOpen ? "var(--c-ink)" : undefined, color: isOpen ? "#fff" : undefined }}><Icon name={o.icon} size={18} /></span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 650, fontSize: 15 }}>{o.title}</span>
                    {o.tag && <span className={o.quietTag ? "c-pill c-pill-quiet" : "c-pill c-pill-lime"}>{o.tag}</span>}
                  </span>
                  <span className="c-small" style={{ lineHeight: 1.4 }}>{o.sub}</span>
                </span>
                <span style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform .15s", display: "flex" }}><Icon name="chev" size={16} /></span>
              </button>
              {isOpen && <div id={`topup-${o.id}`} style={{ padding: "0 0 16px 48px" }}>{o.panel}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
