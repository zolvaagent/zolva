import { SkeletonHead, SkeletonPage, SkeletonTable, SkeletonTabs } from "@/components/ui/Skeleton";

/** Markets: asset and sort tabs, then the token table. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading markets">
      <SkeletonHead />
      <div className="skeleton-row" style={{ marginBottom: "var(--space-200)" }}>
        <SkeletonTabs count={4} />
        <SkeletonTabs count={2} />
      </div>
      <SkeletonTable rows={10} columns={7} />
    </SkeletonPage>
  );
}
