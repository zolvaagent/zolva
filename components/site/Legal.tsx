import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, updated = "October 15, 2026", children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="container page">
      <div className="prose">
        <Link className="eyebrow" href="/" style={{ textDecoration: "none" }}>
          <i className="ph ph-arrow-left" />
          Home
        </Link>
        <h1 className="page__title" style={{ color: "var(--color-text)" }}>
          {title}
        </h1>
        <p>Last updated {updated}. This is written in plain language and has not yet had a full legal review.</p>
        {children}
      </div>
    </div>
  );
}
