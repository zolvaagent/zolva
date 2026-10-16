import { Skeleton, SkeletonCard, SkeletonHead, SkeletonPage } from "@/components/ui/Skeleton";

/** Dashboard: three stat tiles, agent cards, and the side cards. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading your dashboard">
      <SkeletonHead eyebrow button lead={false} />
      <div className="dash-stats">
        {[0, 1, 2].map((i) => (
          <div key={i} className="dash-stat skeleton-stack">
            <Skeleton width={110} height={12} />
            <Skeleton width="60%" height={32} />
            <Skeleton width="80%" height={12} />
          </div>
        ))}
      </div>
      <div className="dash-layout">
        <div className="stack">
          <div className="skeleton-row" style={{ marginTop: "var(--space-200)" }}>
            <Skeleton width={130} height={20} />
            <Skeleton width={110} height={12} />
          </div>
          <div className="agent-cards">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="agent-card skeleton-stack">
                <div className="skeleton-row">
                  <Skeleton width={44} height={44} radius="var(--radius-xl)" />
                  <Skeleton width={84} height={24} radius="var(--radius-full)" />
                </div>
                <Skeleton width="65%" height={20} />
                <Skeleton width="85%" height={12} />
                <Skeleton height={56} radius="var(--radius-lg)" />
              </div>
            ))}
          </div>
        </div>
        <div className="stack">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    </SkeletonPage>
  );
}
