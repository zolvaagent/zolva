/**
 * Longbow's own mark (longbow.finance/favicon.png) on a small white chip, so its navy reads in both themes.
 * Decorative by default; pass a title where the mark stands alone (the markets list), so it says what it means.
 */
export function LongbowMark({ title }: { title?: string }) {
  return (
    <span className="partner-chip" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title} title={title}>
      <img src="/img/partners/longbow-mark.png" alt="" width={12} height={12} />
    </span>
  );
}
