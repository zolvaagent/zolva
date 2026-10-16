import { Skeleton, SkeletonCard, SkeletonChart, SkeletonPage } from "@/components/ui/Skeleton";

/** Agent page: name and pills, then chart and decisions beside the settings. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the agent">
      <div className="page__head">
        <div className="skeleton-stack" style={{ flex: "1 1 320px", maxWidth: 560 }}>
          <Skeleton width={110} height={12} />
          <Skeleton width="50%" height={36} radius="var(--radius-lg)" />
          <div className="skeleton-row" style={{ justifyContent: "flex-start" }}>
            <Skeleton width={84} height={24} radius="var(--radius-full)" />
            <Skeleton width={200} height={14} />
          </div>
        </div>
        <div className="skeleton-row">
          <Skeleton width={110} height={40} radius="var(--radius-full)" />
          <Skeleton width={96} height={40} radius="var(--radius-full)" />
        </div>
      </div>
      <div className="agent-layout">
        <div className="stack">
          <SkeletonChart height={260} />
          <SkeletonCard lines={5} />
        </div>
        <div className="stack">
          <SkeletonCard lines={8} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </SkeletonPage>
  );
}
