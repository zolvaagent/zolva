import { Skeleton, SkeletonHead, SkeletonPage, SkeletonTabs } from "@/components/ui/Skeleton";

/** Activity: filter tabs, then hour groups of trades. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading activity">
      <SkeletonHead />
      <div style={{ marginBottom: "var(--space-200)" }}>
        <SkeletonTabs count={3} />
      </div>
      <div className="stack">
        {[0, 1, 2].map((group) => (
          <div key={group} className="card skeleton-stack">
            <div className="skeleton-row">
              <Skeleton width={180} height={18} />
              <Skeleton width={120} height={12} />
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="skeleton-row" style={{ justifyContent: "flex-start", flexWrap: "nowrap", paddingTop: "var(--space-75)" }}>
                <Skeleton width={36} height={36} radius="var(--radius-full)" />
                <div className="skeleton-stack" style={{ flex: 1 }}>
                  <Skeleton width="45%" height={14} />
                  <Skeleton width="85%" height={12} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
