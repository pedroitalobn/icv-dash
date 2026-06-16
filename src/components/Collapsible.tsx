"use client";

import { useState, type ReactNode } from "react";

/** Seção com título clicável para expandir/recolher e ação opcional (ex.: export). */
export function Collapsible({
  title,
  count,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="collapsible">
      <div className="collapsible-head">
        <button
          type="button"
          className="collapsible-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className={`chev ${open ? "open" : ""}`}>›</span>
          <span className="section-title">
            {title}
            {count != null && (
              <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>
                {" "}
                ({count})
              </span>
            )}
          </span>
        </button>
        {action}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
