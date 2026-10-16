import { Skeleton, SkeletonChart, SkeletonHead, SkeletonPage } from "@/components/ui/Skeleton";

/** Studio: the form on the left, the backtest on the right. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the Studio">
      <SkeletonHead />
      <div className="studio">
        <div className="card skeleton-stack" style={{ gap: "var(--space-300)" }}>
          {[0, 1, 2].map((section) => (
            <div key={section} className="skeleton-stack">
              <Skeleton width={120} height={14} />
              <Skeleton height={section === 0 ? 48 : 88} radius="var(--radius-2xl)" />
            </div>
          ))}
          <div className="skeleton-stack">
            <Skeleton width={120} height={14} />
            <div className="skeleton-row" style={{ justifyContent: "flex-start" }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} width={92} height={56} radius="var(--radius-xl)" />
              ))}
            </div>
          </div>
        </div>
        <div className="stack">
          <SkeletonChart height={260} />
        </div>
      </div>
    </SkeletonPage>
  );
}
