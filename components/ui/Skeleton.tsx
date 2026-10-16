import type { CSSProperties, ReactNode } from "react";

/**
 * Loading placeholders for the app's loading.tsx files. Next.js shows them
 * the moment a link is clicked, while the server page fetches its data, so
 * they mirror the real layouts (same containers and grids) and the page
 * does not jump when the content arrives. Server components, no JavaScript.
 */

type BlockProps = { width?: CSSProperties["width"]; height?: number; radius?: CSSProperties["borderRadius"]; style?: CSSProperties };

/** One grey block that softly pulses. */
export function Skeleton({ width = "100%", height = 16, radius, style }: BlockProps) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** Page wrapper: announces loading to screen readers once, hides the blocks themselves. */
export function SkeletonPage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="container page" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Title, lead line and an optional button, like .page__head. */
export function SkeletonHead({ eyebrow = false, button = false, lead = true }: { eyebrow?: boolean; button?: boolean; lead?: boolean }) {
  return (
    <div className="page__head">
      <div className="skeleton-stack" style={{ flex: "1 1 320px", maxWidth: 560 }}>
        {eyebrow && <Skeleton width={140} height={12} />}
        <Skeleton width="55%" height={36} radius="var(--radius-lg)" />
        {lead && <Skeleton width="90%" height={14} />}
      </div>
      {button && <Skeleton width={150} height={40} radius="var(--radius-full)" />}
    </div>
  );
}

/** A card with a title and a few text lines. */
export function SkeletonCard({ lines = 3, children }: { lines?: number; children?: ReactNode }) {
  return (
    <div className="card skeleton-stack">
      <Skeleton width="40%" height={20} />
      {children}
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} height={12} />
      ))}
    </div>
  );
}

/** A chart area inside a card. */
export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div className="card skeleton-stack">
      <div className="skeleton-row">
        <Skeleton width={160} height={20} />
        <Skeleton width={120} height={28} radius="var(--radius-full)" />
      </div>
      <Skeleton height={height} radius="var(--radius-lg)" />
    </div>
  );
}

/** Pill tabs, like .tabs. */
export function SkeletonTabs({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-row" style={{ justifyContent: "flex-start" }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={i === 0 ? 112 : 96} height={32} radius="var(--radius-full)" />
      ))}
    </div>
  );
}

/** Table rows inside a card. */
export function SkeletonTable({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="card skeleton-table">
      {Array.from({ length: rows + 1 }, (_, row) => (
        <div key={row} className="skeleton-table__row" style={{ gridTemplateColumns: `minmax(0, 2.2fr) repeat(${columns - 1}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} width={column === 0 ? "75%" : "60%"} height={row === 0 ? 10 : 14} />
          ))}
        </div>
      ))}
    </div>
  );
}
