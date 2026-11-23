"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { unseenItems, WHATS_NEW_SEEN_KEY, type WhatsNewItem } from "@/lib/whats-new";

/** "23 Nov" from YYYY-MM-DD, in UTC like the dev log. */
function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Dashboard card with the dev log entries the visitor has not seen. Closing it saves the newest
 * entry's id in this browser, so it comes back only when a newer entry ships.
 */
export function WhatsNew({ items }: { items: WhatsNewItem[] }) {
  // Null until mounted: the record lives in localStorage, and rendering nothing on the server
  // avoids a flash of the card for visitors who already closed it.
  const [shown, setShown] = useState<WhatsNewItem[] | null>(null);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(WHATS_NEW_SEEN_KEY);
    } catch {
      // Storage blocked (private mode, site data off): show the newest entries every visit.
    }
    setShown(unseenItems(items, seen));
  }, [items]);

  if (!shown?.length) return null;

  const close = () => {
    try {
      localStorage.setItem(WHATS_NEW_SEEN_KEY, items[0].id);
    } catch {
      // Nothing to keep; the card still closes for this visit.
    }
    setShown([]);
  };

  return (
    <section className="card whats-new" aria-labelledby="whats-new-title">
      <div className="whats-new__head">
        <h2 className="card__title" id="whats-new-title">
          <i className="ph ph-sparkle" aria-hidden="true" />
          What&apos;s new
        </h2>
        <button className="agent-panel__close" type="button" onClick={close} aria-label="Close what's new">
          <i className="ph ph-x" aria-hidden="true" />
        </button>
      </div>
      <ul className="whats-new__list">
        {shown.map((item) => (
          <li key={item.id}>
            <Link className="whats-new__item" href={item.href}>
              <span className="whats-new__title">{item.title}</span>
              <span className="whats-new__meta muted">
                {item.area} · {shortDate(item.date)}
              </span>
              <i className="ph ph-arrow-right whats-new__arrow" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link className="text-link whats-new__all" href="/devlog">
        All updates in the dev log
      </Link>
    </section>
  );
}
