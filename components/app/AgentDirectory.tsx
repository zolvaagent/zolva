"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentKindPills, matchesVenue, VENUE_FILTERS, type VenueFilter } from "@/components/app/AgentKind";
import type { AgentCard } from "@/lib/data/agents";
import { marketList, percent, points, sparkline, STRATEGY_NAMES, tone } from "@/lib/format";

const SORTS = [
  ["traded", "Traded last"],
  ["newest", "Newest"],
  ["return", "Highest return"],
] as const;

const SIDE_LABELS = { buy: "Bought", sell: "Sold", short: "Shorted", cover: "Covered" } as const;

/** "this hour", "3 h ago", "2 days ago" from unix seconds. */
function ago(ts: number): string {
  const hours = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (hours < 1) return "this hour";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Every public agent as a card: what it holds now, its latest reasoning, and a way to copy it. */
export function AgentDirectory({ cards }: { cards: AgentCard[] }) {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("traded");
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = cards.filter(
      (card) =>
        matchesVenue(card.summary, venue) &&
        (!needle ||
          card.summary.name.toLowerCase().includes(needle) ||
          (STRATEGY_NAMES[card.summary.strategy] ?? "").toLowerCase().includes(needle) ||
          card.summary.tokens.some((token) => token.symbol.toLowerCase().includes(needle))),
    );
    const sorters = {
      traded: (a: AgentCard, b: AgentCard) => (b.lastTrade?.ts ?? 0) - (a.lastTrade?.ts ?? 0),
      newest: (a: AgentCard, b: AgentCard) => b.summary.createdAt - a.summary.createdAt,
      return: (a: AgentCard, b: AgentCard) => b.summary.returnPct - a.summary.returnPct,
    };
    return list.sort(sorters[sort]);
  }, [cards, sort, venue, query]);

  return (
    <>
      <div className="filter-row">
        <div className="tabs" role="tablist" aria-label="Sort by">
          {SORTS.map(([key, label]) => (
            <button key={key} className="tab" role="tab" type="button" aria-selected={sort === key} onClick={() => setSort(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="directory-tools">
          <div className="tabs" role="tablist" aria-label="Spot or perps">
            {VENUE_FILTERS.map(([key, label]) => (
              <button key={key} className="tab" role="tab" type="button" aria-selected={venue === key} onClick={() => setVenue(key)}>
                {label}
              </button>
            ))}
          </div>
          <label className="directory-search">
            <span className="sr-only">Search agents</span>
            <i className="ph ph-magnifying-glass" aria-hidden="true" />
            <input className="input" type="search" placeholder="Name, strategy or market" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
      </div>

      {!shown.length ? (
        <div className="card">
          <div className="empty">
            <img src="/img/icons/agent.png" alt="" width={72} height={72} />
            <h2 className="card__title">{cards.length ? "No agent matches" : "No public agents yet"}</h2>
            <p>{cards.length ? "Try another market or clear the search." : "Agents appear here once they are published. Build one in the Studio."}</p>
            {cards.length ? (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setQuery("");
                  setVenue("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link className="button button--primary" href="/studio">
                Open the Studio
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="agent-cards agent-cards--directory">
          {shown.map((card) => (
            <DirectoryCard key={card.summary.id} card={card} />
          ))}
        </div>
      )}
    </>
  );
}

function DirectoryCard({ card }: { card: AgentCard }) {
  const { summary, holdings, latest, lastTrade, curve } = card;
  const symbols = summary.tokens.map((token) => token.symbol);
  return (
    <article className="directory-card">
      <div className="directory-card__head">
        <div>
          <h2 className="card__title">
            <Link className="directory-card__name" href={`/agents/${summary.id}`}>
              {summary.name}
            </Link>
          </h2>
          <p className="muted directory-card__meta" title={symbols.join(", ")}>
            {STRATEGY_NAMES[summary.strategy] ?? summary.strategy} · {marketList(symbols)}
          </p>
        </div>
        <span className="pill-row">
          <AgentKindPills agent={summary} />
          {summary.isHouse && <span className="pill">by Zolva</span>}
        </span>
      </div>

      <div className="directory-card__numbers">
        <span>
          Return<strong className={tone(summary.returnPct)}>{percent(summary.returnPct)}</strong>
        </span>
        <span>
          vs holding<strong className={tone(summary.edge)}>{points(summary.edge)}</strong>
        </span>
        {curve.length > 1 && (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="Value over the last 7 days" role="img">
            <polyline points={sparkline(curve, 32, 2)} fill="none" stroke="var(--color-purple-rich)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div className="directory-card__row">
        <span className="directory-card__label">Holding</span>
        {holdings.length ? (
          <span className="directory-card__chips">
            {holdings.map((holding) => (
              <span key={`${holding.symbol}-${holding.side}`} className="pill">
                {holding.symbol}
                {holding.side === "short" && " short"}
              </span>
            ))}
          </span>
        ) : (
          <span className="muted">Cash, waiting for a signal</span>
        )}
      </div>

      {latest ? (
        <div className="decision directory-card__decision">
          <span className={`decision__action decision__action--${latest.action}`}>{latest.action}</span>
          <span>
            <strong>{latest.symbol}</strong> <span className="muted">{latest.reasoning}</span>
            <span className="directory-card__when">{ago(latest.ts)}</span>
          </span>
        </div>
      ) : (
        <div className="agent-card__waiting">
          <span className="pulse" />
          First decision at the top of the hour
        </div>
      )}

      <div className="directory-card__foot">
        <span className="muted">{lastTrade ? `${SIDE_LABELS[lastTrade.side]} ${lastTrade.symbol} ${ago(lastTrade.ts)}` : "No trades in 30 days"}</span>
        <span className="directory-card__actions">
          {card.copyable && (
            <Link className="button button--small" href={`/studio?from=${summary.id}`}>
              Use these rules
            </Link>
          )}
          <Link className="button button--small button--primary" href={`/agents/${summary.id}`}>
            View agent
          </Link>
        </span>
      </div>
    </article>
  );
}
