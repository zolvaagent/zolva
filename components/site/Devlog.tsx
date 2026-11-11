"use client";

import { useEffect, useMemo, useState } from "react";

import { DEVLOG_AREAS, type DevlogArea, type DevlogEntry } from "@/lib/devlog";

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayLabel = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

/** The unfiltered list opens on the newest two weeks; older days wait behind "Show older". */
const RECENT_DAYS = 14;
/** Bodies longer than this are cut to two lines with a More button. */
const CLAMP_CHARS = 180;

/** "API & MCP" -> "api-mcp": picks the area color in CSS (.devlog-area--*). */
const areaKey = (area: DevlogArea) => area.toLowerCase().replace(/[^a-z]+/g, "-");

const daysBefore = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/**
 * The dev log list: area filter chips, then entries grouped by day on a timeline, newest first.
 * The chosen area is kept in the URL (?area=) so a filtered view can be shared; each entry has a
 * permalink, and opening one shows it in full even when it is older than two weeks.
 */
export function DevlogList({ entries }: { entries: DevlogEntry[] }) {
  const [area, setArea] = useState<DevlogArea | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);
  // A #permalink to scroll to once its entry is on the page.
  const [pending, setPending] = useState<string | null>(null);

  // Read ?area= and a #permalink once on load (the page is static, so the server never sees them).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("area");
    const match = DEVLOG_AREAS.find((item) => item.toLowerCase() === fromUrl?.toLowerCase());
    const target = decodeURIComponent(window.location.hash.slice(1));
    /* eslint-disable react-hooks/set-state-in-effect -- the URL is only readable after hydration */
    if (match) setArea(match);
    if (target && entries.some((entry) => entry.id === target)) {
      setShowOlder(true);
      setExpanded(new Set([target]));
      setPending(target);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [entries]);

  const pick = (next: DevlogArea | null) => {
    setArea(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("area", next.toLowerCase());
    else url.searchParams.delete("area");
    url.hash = "";
    window.history.replaceState(null, "", url);
  };

  const filtered = useMemo(() => (area ? entries.filter((entry) => entry.area === area) : entries), [entries, area]);
  // A filter already makes the list short, so it always shows every matching entry.
  const cutoff = entries.length ? daysBefore(entries[0].date, RECENT_DAYS) : "";
  const visible = area || showOlder ? filtered : filtered.filter((entry) => entry.date > cutoff);
  const hiddenCount = filtered.length - visible.length;

  const days = useMemo(() => {
    const groups = new Map<string, DevlogEntry[]>();
    for (const entry of visible) groups.set(entry.date, [...(groups.get(entry.date) ?? []), entry]);
    return [...groups.entries()];
  }, [visible]);

  // The entry may have been hidden behind "Show older" on first paint; scroll once it is rendered.
  useEffect(() => {
    if (!pending) return;
    document.getElementById(pending)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot after the entry renders
    setPending(null);
  }, [pending, days]);

  const counts = useMemo(() => {
    const result = new Map<DevlogArea, number>();
    for (const entry of entries) result.set(entry.area, (result.get(entry.area) ?? 0) + 1);
    return result;
  }, [entries]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/devlog#${id}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null),
    );
  };

  return (
    <>
      <div className="devlog-filters" role="group" aria-label="Filter by area">
        <button className="devlog-chip" type="button" aria-pressed={area === null} onClick={() => pick(null)}>
          All <span>{entries.length}</span>
        </button>
        {DEVLOG_AREAS.filter((item) => counts.has(item)).map((item) => (
          <button key={item} className={`devlog-chip devlog-area--${areaKey(item)}`} type="button" aria-pressed={area === item} onClick={() => pick(item)}>
            {item} <span>{counts.get(item)}</span>
          </button>
        ))}
      </div>

      {days.map(([date, dayEntries]) => (
        <section key={date} className="devlog-day" aria-labelledby={`day-${date}`}>
          <h2 className="devlog-day__date" id={`day-${date}`}>
            <time dateTime={date}>{dayLabel(date)}</time>
          </h2>
          {dayEntries.map((entry) => {
            const long = entry.body.length > CLAMP_CHARS;
            const open = !long || expanded.has(entry.id);
            return (
              <article key={entry.id} className="devlog-entry" id={entry.id}>
                <div className="devlog-entry__head">
                  <span className={`devlog-entry__area devlog-area--${areaKey(entry.area)}`}>{entry.area}</span>
                  <h3 className="devlog-entry__title">{entry.title}</h3>
                  <button
                    className="devlog-entry__link"
                    type="button"
                    onClick={() => copyLink(entry.id)}
                    aria-label={copied === entry.id ? "Link copied" : `Copy link to ${entry.title}`}
                    title="Copy link"
                  >
                    <i className={`ph ${copied === entry.id ? "ph-check" : "ph-link"}`} aria-hidden="true" />
                  </button>
                </div>
                <p className={`devlog-entry__body${open ? "" : " devlog-entry__body--clamped"}`}>{entry.body}</p>
                <div className="devlog-entry__sources">
                  {long && (
                    <button className="devlog-entry__more" type="button" aria-expanded={open} onClick={() => toggle(entry.id)}>
                      {open ? "Less" : "More"}
                    </button>
                  )}
                  <span>Sources</span>
                  {entry.sources.map((source) => (
                    <a key={source.href} className="devlog-source" href={source.href} target="_blank" rel="noopener noreferrer">
                      {source.label}
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ))}

      {hiddenCount > 0 && (
        <div className="devlog-older">
          <button className="button button--ghost" type="button" onClick={() => setShowOlder(true)}>
            Show older ({hiddenCount} entries, back to {dayLabel(entries[entries.length - 1].date)})
          </button>
        </div>
      )}
    </>
  );
}
