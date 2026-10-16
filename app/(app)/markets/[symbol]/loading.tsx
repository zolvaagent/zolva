import { Skeleton, SkeletonCard, SkeletonChart, SkeletonPage } from "@/components/ui/Skeleton";

/** One market: logo, symbol and price, then chart beside the stats. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the market">
      <div className="page__head">
        <div className="skeleton-row" style={{ justifyContent: "flex-start", gap: "var(--space-200)" }}>
          <Skeleton width={56} height={56} radius="var(--radius-full)" />
          <div className="skeleton-stack">
            <Skeleton width={120} height={32} />
            <Skeleton width={200} height={14} />
          </div>
        </div>
        <Skeleton width={160} height={40} radius="var(--radius-full)" />
      </div>
      <div className="agent-layout">
        <div className="stack">
          <SkeletonChart height={280} />
          <SkeletonCard lines={4} />
        </div>
        <div className="stack">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </SkeletonPage>
  );
}
