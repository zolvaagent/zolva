import { SkeletonCard, SkeletonHead, SkeletonPage } from "@/components/ui/Skeleton";

/** Settings: one column of account, membership, credits and API key cards. */
export default function Loading() {
  return (
    <SkeletonPage label="Loading your settings">
      <SkeletonHead eyebrow lead={false} />
      <div className="settings">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </div>
    </SkeletonPage>
  );
}
