import type { DevlogEntry } from "@/lib/devlog";

/** What the dashboard's "What's new" card needs of one dev log entry. */
export type WhatsNewItem = {
  id: string;
  date: string;
  area: string;
  title: string;
  /** The page the entry is about, or its place on /devlog when it only links commits. */
  href: string;
};

/** localStorage key holding the id of the newest entry the visitor closed the card on. */
export const WHATS_NEW_SEEN_KEY = "zolva.whats-new.seen";

/** Entries the card may show: the newest few, so a first visit does not get the whole history. */
export const WHATS_NEW_MAX = 3;

const COMMIT_LINK = "https://github.com/zolvaagent/zolva/commit/";
const SITE = "https://zolvaagent.app";

/** Newest entries first (DEVLOG order), each linked to the page it is about. */
export function whatsNewItems(entries: DevlogEntry[], limit = 10): WhatsNewItem[] {
  return entries.slice(0, limit).map((entry) => {
    const page = entry.sources.find((source) => source.href.startsWith(SITE));
    // Same-site links stay relative so they work on localhost and the workers.dev fallback too.
    const href = page ? page.href.slice(SITE.length) || "/" : `/devlog#${entry.id}`;
    return { id: entry.id, date: entry.date, area: entry.area, title: entry.title, href };
  });
}

/**
 * Entries newer than the one the visitor last closed the card on, at most WHATS_NEW_MAX.
 * No record (first visit), or a record older than every item, shows the newest WHATS_NEW_MAX.
 */
export function unseenItems(items: WhatsNewItem[], seenId: string | null): WhatsNewItem[] {
  const seenAt = seenId === null ? -1 : items.findIndex((item) => item.id === seenId);
  return items.slice(0, seenAt === -1 ? WHATS_NEW_MAX : Math.min(seenAt, WHATS_NEW_MAX));
}
