import { SkeletonHead, SkeletonPage, SkeletonTable, SkeletonTabs } from "@/components/ui/Skeleton";

/** Leaderboard: sort tabs, strategy filter and the ranking table. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading the leaderboard">
      <SkeletonHead button />
      <div className="skeleton-row" style={{ marginBottom: "var(--space-200)" }}>
        <SkeletonTabs count={3} />
        <SkeletonTabs count={4} />
      </div>
      <SkeletonTable rows={8} columns={8} />
    </SkeletonPage>
  );
}
