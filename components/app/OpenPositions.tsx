"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TickerAvatar } from "@/components/ui/TickerAvatar";
import type { OpenPositions as Data, OpenPosition } from "@/lib/data/open-positions";
import { dateAt, percent, price, signedUsd, tone, usd } from "@/lib/format";

const VENUES = [
  ["all", "All"],
  ["spot", "Spot"],
  ["perps", "Perps"],
] as const;
type Venue = (typeof VENUES)[number][0];

/** "3 h", "2 d" from unix seconds. */
function heldFor(openedAt: number | null): string {
  if (openedAt === null) return "–";
  const hours = Math.max(0, Math.floor((Date.now() / 1000 - openedAt) / 3600));
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/** /activity "Open positions": what every public paper agent holds right now and how it is doing. */
export function OpenPositions({ data }: { data: Data }) {
  const [venue, setVenue] = useState<Venue>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.positions.filter(
      (position) => (venue === "all" || position.venue === venue) && (!needle || position.agentName.toLowerCase().includes(needle) || position.symbol.toLowerCase().includes(needle)),
    );
  }, [data.positions, venue, query]);

  const holding = new Set(shown.map((position) => position.agentId)).size;
  const total = shown.reduce((sum, position) => sum + position.pnlUsd, 0);
  const counts = new Map<string, number>();
  for (const position of shown) counts.set(position.symbol, (counts.get(position.symbol) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: "var(--space-300)" }}>
        <div className="stat">
          <span className="stat__label">Open positions</span>
          <span className="stat__value">{shown.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Agents holding</span>
          <span className="stat__value">
            {holding}{" "}
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
              of {data.agents}
            </span>
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Unrealised P&amp;L, all</span>
          <span className={`stat__value ${tone(total)}`}>{signedUsd(total)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Most held</span>
          <span className="stat__value">{top ? `${top[0]} (${top[1]})` : "None"}</span>
        </div>
      </div>

      <div className="filter-row">
        <div className="tabs" role="radiogroup" aria-label="Spot or perps">
          {VENUES.map(([key, label]) => (
            <button key={key} className="tab" role="radio" type="button" aria-checked={venue === key} onClick={() => setVenue(key)}>
              {label}
            </button>
          ))}
        </div>
        <label className="directory-search">
          <span className="sr-only">Search agents or markets</span>
          <i className="ph ph-magnifying-glass" aria-hidden="true" />
          <input className="input" type="search" placeholder="Search agents or markets" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {shown.length ? (
        <section className="card" aria-label="Open positions">
          <div className="table-wrap">
            <table className="table open-positions">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Market</th>
                  <th className="open-positions__wide">Held</th>
                  <th className="num open-positions__wide">Entry → now</th>
                  <th className="num open-positions__wide">Value</th>
                  <th className="num">Unrealised</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((position) => (
                  <PositionRow key={`${position.agentId}-${position.symbol}`} position={position} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="card">
          <div className="empty">
            <h2 className="card__title">{data.positions.length ? "No position matches" : "No open positions"}</h2>
            <p>{data.positions.length ? "Try another market or clear the search." : "Every public agent is in cash right now."}</p>
          </div>
        </div>
      )}

      <p className="muted" style={{ marginTop: "var(--space-200)", fontSize: 12, lineHeight: "16px" }}>
        Paper trading. Valued at the latest hourly close{data.pricedAt !== null ? ` (${dateAt(data.pricedAt)})` : ""}, after trading costs; a short gains when the price falls. Trench agents are not included.
      </p>
    </>
  );
}

function PositionRow({ position }: { position: OpenPosition }) {
  return (
    <tr>
      <td>
        <Link className="text-link" href={`/agents/${position.agentId}`}>
          {position.agentName}
        </Link>
        {position.paused && <span className="muted"> · paused</span>}
      </td>
      <td>
        <span className="open-positions__market">
          <TickerAvatar symbol={position.symbol} size={20} />
          {position.symbol}
          {position.side === "short" && <span className="pill">Short</span>}
        </span>
      </td>
      <td className="muted open-positions__wide">{heldFor(position.openedAt)}</td>
      <td className="num muted open-positions__wide">
        {price(position.entryPrice)} → {price(position.price)}
      </td>
      <td className="num open-positions__wide">{usd(position.valueUsd)}</td>
      <td className="num">
        <span className={tone(position.pnlUsd)}>{signedUsd(position.pnlUsd)}</span>
        <span className={`open-positions__pct ${tone(position.pnlPct)}`}>{percent(position.pnlPct)}</span>
      </td>
    </tr>
  );
}
