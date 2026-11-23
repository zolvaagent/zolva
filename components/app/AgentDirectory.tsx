"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { matchesVenue, VENUE_FILTERS, type VenueFilter } from "@/components/app/AgentKind";
import { Select } from "@/components/ui/Select";
import { statsFor, TIMEFRAMES, TOO_YOUNG, type Timeframe } from "@/lib/agents/periods";
import { isRankedRecord, MIN_RANKED_DAYS, MIN_RANKED_RUNS } from "@/lib/agents/tested";
import type { AgentCard, AgentGroup } from "@/lib/data/agents";
import { percent, points, signedUsd, sparkline, tone } from "@/lib/format";

/**
 * /agents: list first, details on demand (Research's proposal, Brand's prototype/agents.html, owner
 * approved 2026-11-23). Tested agents are the only cards; community agents are compact rows; Lab
 * experiments sit collapsed. A card or row opens a side panel (a bottom sheet on phones) with the
 * latest decision and what the agent holds.
 */

const SORTS = [
  { value: "return", label: "Highest return" },
  { value: "traded", label: "Traded last" },
  { value: "newest", label: "Newest" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

/** Community rows shown before "Show all". */
const COMMUNITY_PREVIEW = 8;

const SIDE_LABELS = { buy: "Bought", sell: "Sold", short: "Shorted", cover: "Covered" } as const;

/** Days of live paper record: hourly runs / 24, as on the Leaderboard. */
const recordDays = (card: AgentCard) => Math.floor(card.summary.runs / 24);
const daysText = (days: number) => (days === 1 ? "1 day" : `${days} days`);
const isNew = (card: AgentCard) => !isRankedRecord(card.summary);
const markets = (card: AgentCard) => card.summary.tokens.map((token) => token.symbol);
const venueName = (card: AgentCard) => (card.summary.venue === "perps" ? "Perps" : "Spot");

/** "this hour", "3 h ago", "2 days ago" from unix seconds. */
function ago(ts: number): string {
  const hours = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (hours < 1) return "this hour";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function AgentDirectory({ cards }: { cards: AgentCard[] }) {
  const [query, setQuery] = useState("");
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [sort, setSort] = useState<Sort>("return");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = cards.filter(
      (card) =>
        matchesVenue(card.summary, venue) &&
        (!needle || card.summary.name.toLowerCase().includes(needle) || markets(card).some((symbol) => symbol.toLowerCase().includes(needle))),
    );
    const byReturn = (a: AgentCard, b: AgentCard) => {
      const x = statsFor(a.summary, timeframe);
      const y = statsFor(b.summary, timeframe);
      // Agents younger than the timeframe go last, newest first (as on the Leaderboard).
      if (!x || !y) return x ? -1 : y ? 1 : b.summary.createdAt - a.summary.createdAt;
      return y.returnPct - x.returnPct;
    };
    const sorters: Record<Sort, (a: AgentCard, b: AgentCard) => number> = {
      return: byReturn,
      traded: (a, b) => (b.lastTrade?.ts ?? 0) - (a.lastTrade?.ts ?? 0),
      newest: (a, b) => b.summary.createdAt - a.summary.createdAt,
    };
    list.sort(sorters[sort]);
    const of = (group: AgentGroup) => list.filter((card) => card.group === group);
    return { tested: of("tested"), community: of("community"), lab: of("lab") };
  }, [cards, query, venue, timeframe, sort]);

  const open = openId ? (cards.find((card) => card.summary.id === openId) ?? null) : null;
  const select = (card: AgentCard, button: HTMLButtonElement) => {
    trigger.current = button;
    setOpenId(card.summary.id);
  };
  const close = () => {
    setOpenId(null);
    // Back to the card or row that opened the panel.
    trigger.current?.focus();
  };

  const community = showAll ? groups.community : groups.community.slice(0, COMMUNITY_PREVIEW);
  const windowLabel = timeframe === "all" ? "" : ` · ${timeframe}`;
  const nothing = !groups.tested.length && !groups.community.length && !groups.lab.length;

  return (
    <>
      <div className="agents-filters" role="search">
        <label className="directory-search agents-filters__search">
          <span className="sr-only">Search agents or markets</span>
          <i className="ph ph-magnifying-glass" aria-hidden="true" />
          <input className="input" type="search" placeholder="Search agents or markets" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="tabs" role="radiogroup" aria-label="Spot or perps">
          {VENUE_FILTERS.map(([key, label]) => (
            <button key={key} className="tab" role="radio" type="button" aria-checked={venue === key} onClick={() => setVenue(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tabs agents-filters__timeframe" role="radiogroup" aria-label="Timeframe">
          {TIMEFRAMES.map(([key, label]) => (
            <button key={key} className="tab" role="radio" type="button" aria-checked={timeframe === key} onClick={() => setTimeframe(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="agents-filters__sort">
          <Select label="Sort agents" value={sort} options={SORTS.map((option) => ({ ...option }))} onChange={setSort} />
        </div>
      </div>

      {nothing ? (
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
        <>
          {groups.tested.length > 0 && (
            <section className="agents-section" aria-labelledby="agents-tested">
              <div className="agents-section__head">
                <h2 className="agents-section__title" id="agents-tested">
                  Zolva&apos;s tested agents
                </h2>
                <span className="agents-section__note">Rules that passed Research&apos;s 6 year test</span>
              </div>
              <div className="tested-cards">
                {groups.tested.map((card) => (
                  <TestedCard key={card.summary.id} card={card} timeframe={timeframe} current={openId === card.summary.id} onSelect={select} />
                ))}
              </div>
            </section>
          )}

          {groups.community.length > 0 && (
            <section className="agents-section" aria-labelledby="agents-community">
              <div className="agents-section__head">
                <h2 className="agents-section__title" id="agents-community">
                  Community agents <span className="agents-section__count">{groups.community.length}</span>
                </h2>
                <span className="agents-section__note">
                  {timeframe === "all" ? "Return is since the agent started" : `Return over the last ${timeframe === "24h" ? "24 hours" : timeframe === "7d" ? "7 days" : "30 days"}`}
                </span>
              </div>
              <div className="agent-rows">
                <div className="agent-rows__head" aria-hidden="true">
                  <span>Agent</span>
                  <span>Return{windowLabel}</span>
                  <span>vs holding{windowLabel}</span>
                  <span>Last 7 days</span>
                </div>
                <ul>
                  {community.map((card) => (
                    <AgentRow key={card.summary.id} card={card} timeframe={timeframe} current={openId === card.summary.id} onSelect={select} />
                  ))}
                </ul>
                {groups.community.length > COMMUNITY_PREVIEW && (
                  <div className="agent-rows__more">
                    <button className="button button--ghost button--small" type="button" onClick={() => setShowAll(!showAll)}>
                      {showAll ? "Show fewer" : `Show all ${groups.community.length}`}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {groups.lab.length > 0 && (
            <section className="agents-section" aria-labelledby="agents-lab">
              <details className="agents-lab">
                <summary>
                  <span>
                    <span className="agents-section__title" id="agents-lab">
                      Lab experiments <span className="agents-section__count">{groups.lab.length}</span>
                    </span>
                    <span className="agents-section__note">Zolva&apos;s research agents testing ideas. Most get stopped.</span>
                  </span>
                  <i className="ph ph-caret-down" aria-hidden="true" />
                </summary>
                <div className="agent-rows">
                  <ul>
                    {groups.lab.map((card) => (
                      <AgentRow key={card.summary.id} card={card} timeframe={timeframe} current={openId === card.summary.id} onSelect={select} />
                    ))}
                  </ul>
                </div>
              </details>
            </section>
          )}
        </>
      )}

      <p className="agents-disclaimer">Paper trading with virtual money at real prices. Past results do not predict future results. Not investment advice.</p>

      <AgentPanel card={open} timeframe={timeframe} onClose={close} />
    </>
  );
}

/** Tested (exactly as on the Leaderboard) and New while the record is under 30 days. No Experiment pill: it is the default. */
function AgentPills({ card }: { card: AgentCard }) {
  return (
    <>
      {card.group === "tested" && (
        <span className="pill pill--running" title="Matches a rule that passed Research's 6 year backtest at this venue's cost">
          Tested
        </span>
      )}
      {isNew(card) && (
        <span className="pill pill--accent" title={`Not ranked until ${MIN_RANKED_DAYS} days and ${MIN_RANKED_RUNS} hourly runs`}>
          New · {recordDays(card)} d
        </span>
      )}
    </>
  );
}

/** The agent's value over the last 7 days, with a dashed line where it started. */
function Spark({ curve, height }: { curve: number[]; height: number }) {
  const line = sparkline(curve, height, 2);
  if (!line) return <span aria-hidden="true" />;
  const change = curve[curve.length - 1] - curve[0];
  const color = change > 0 ? "var(--color-gain)" : change < 0 ? "var(--color-loss)" : "var(--color-text-faint)";
  const startY = line.split(" ")[0].split(",")[1];
  return (
    <svg className="agent-spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ height }}>
      <line x1="0" x2="100" y1={startY} y2={startY} stroke="var(--color-border-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

type ItemProps = { card: AgentCard; timeframe: Timeframe; current: boolean; onSelect: (card: AgentCard, button: HTMLButtonElement) => void };

function TestedCard({ card, timeframe, current, onSelect }: ItemProps) {
  const stats = statsFor(card.summary, timeframe);
  const tooYoung = timeframe === "all" ? "" : TOO_YOUNG[timeframe];
  return (
    <button className="tested-card" type="button" aria-current={current || undefined} aria-haspopup="dialog" onClick={(event) => onSelect(card, event.currentTarget)}>
      <span className="tested-card__name">{card.summary.name}</span>
      <span className="pill-row tested-card__pills">
        <AgentPills card={card} />
      </span>
      <span className="tested-card__markets">
        {markets(card).join(" · ")} · {venueName(card)}
      </span>
      {stats ? (
        <span>
          <span className={`tested-card__return num ${tone(stats.returnPct)}`}>
            {percent(stats.returnPct)}
            {timeframe === "all" && isNew(card) && <small> so far</small>}
          </span>
          <span className="tested-card__vs num">{points(stats.edge)} vs holding</span>
        </span>
      ) : (
        <span title={tooYoung}>
          <span className="tested-card__return muted">—</span>
          <span className="tested-card__vs">{tooYoung}</span>
        </span>
      )}
      <Spark curve={card.curve} height={36} />
    </button>
  );
}

function AgentRow({ card, timeframe, current, onSelect }: ItemProps) {
  const stats = statsFor(card.summary, timeframe);
  const tooYoung = timeframe === "all" ? "" : TOO_YOUNG[timeframe];
  return (
    <li>
      <button className="agent-row" type="button" aria-current={current || undefined} aria-haspopup="dialog" onClick={(event) => onSelect(card, event.currentTarget)}>
        <span className="agent-row__name">
          <span className="agent-row__title">{card.summary.name}</span>
          <span className="agent-row__pills">
            <AgentPills card={card} />
          </span>
        </span>
        {stats ? (
          <>
            <span className={`agent-row__return num ${tone(stats.returnPct)}`}>
              {percent(stats.returnPct)}
              {timeframe === "all" && isNew(card) && <small>so far</small>}
            </span>
            <span className={`agent-row__vs num ${tone(stats.edge)}`}>{points(stats.edge)}</span>
          </>
        ) : (
          <>
            <span className="agent-row__return muted" title={tooYoung}>
              —
            </span>
            <span className="agent-row__vs muted" title={tooYoung}>
              —
            </span>
          </>
        )}
        <span className="agent-row__spark">
          <Spark curve={card.curve} height={24} />
        </span>
      </button>
    </li>
  );
}

/** Side panel on desktop, bottom sheet on phones. Escape and the scrim close it. */
function AgentPanel({ card, timeframe, onClose }: { card: AgentCard | null; timeframe: Timeframe; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  // Keep the last agent while the panel slides out.
  const [shown, setShown] = useState<AgentCard | null>(card);
  if (card && card !== shown) setShown(card);

  useEffect(() => {
    if (!card) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  const isOpen = card !== null;
  const agent = card ?? shown;
  return (
    <>
      <div className="agent-scrim" data-open={isOpen || undefined} onClick={onClose} aria-hidden="true" />
      <aside className="agent-panel" data-open={isOpen || undefined} role="dialog" aria-modal="true" aria-labelledby="agent-panel-name" aria-hidden={!isOpen} inert={!isOpen}>
        <span className="agent-panel__grabber" aria-hidden="true" />
        {agent && <PanelContent card={agent} timeframe={timeframe} onClose={onClose} closeButton={closeButton} />}
      </aside>
    </>
  );
}

function PanelContent({ card, timeframe, onClose, closeButton }: { card: AgentCard; timeframe: Timeframe; onClose: () => void; closeButton: React.RefObject<HTMLButtonElement | null> }) {
  const { summary, latest, lastTrade, holdings } = card;
  const stats = statsFor(summary, timeframe);
  const fresh = isNew(card);
  const label = timeframe === "all" ? (fresh ? " so far" : "") : ` · ${timeframe}`;
  const tooYoung = timeframe === "all" ? "" : TOO_YOUNG[timeframe];
  const held = holdings.map((holding) => `${holding.symbol}${holding.side === "short" ? " short" : ""}`).join(", ");
  return (
    <>
      <div className="agent-panel__head">
        <div>
          <h2 className="agent-panel__name" id="agent-panel-name">
            {summary.name}
          </h2>
          <div className="agent-panel__meta">
            <AgentPills card={card} />
            <span>
              {venueName(card)} · {markets(card).join(", ")}
            </span>
          </div>
        </div>
        <button ref={closeButton} className="agent-panel__close" type="button" aria-label="Close" onClick={onClose}>
          <i className="ph ph-x" aria-hidden="true" />
        </button>
      </div>

      <div className="agent-panel__body">
        <dl className="agent-panel__stats">
          <div>
            <dt>Return{label}</dt>
            <dd className={stats ? `num ${tone(stats.returnPct)}` : "muted"} title={stats ? undefined : tooYoung}>
              {stats ? percent(stats.returnPct) : "—"}
            </dd>
          </div>
          <div>
            <dt>vs holding{label}</dt>
            <dd className={stats ? `num ${tone(stats.edge)}` : "muted"} title={stats ? undefined : tooYoung}>
              {stats ? points(stats.edge) : "—"}
            </dd>
          </div>
          <div>
            <dt>Worst drop{label}</dt>
            <dd className={stats ? "num" : "muted"}>{stats ? (stats.maxDrawdownPct > 0 ? `−${stats.maxDrawdownPct.toFixed(1)}%` : "0%") : "—"}</dd>
          </div>
          <div>
            <dt>Trades</dt>
            <dd className="num">{summary.trades}</dd>
          </div>
        </dl>
        {fresh && (
          <p className="muted agent-panel__note">
            {daysText(recordDays(card))} of record. Ranked after {MIN_RANKED_DAYS} days and {MIN_RANKED_RUNS} hourly runs; until then a short record says little.
          </p>
        )}

        <div>
          <h3 className="agent-panel__label">Latest decision</h3>
          {latest ? (
            <div className="decision">
              <span className={`decision__action decision__action--${latest.action}`}>{latest.action}</span>
              <span>
                <strong>{latest.symbol}</strong> <span className="muted">{latest.reasoning}</span>
                <span className="agent-panel__when">{ago(latest.ts)}</span>
              </span>
            </div>
          ) : (
            <p className="muted">First decision at the top of the hour.</p>
          )}
        </div>

        <div>
          <h3 className="agent-panel__label">Right now</h3>
          <div className="agent-panel__kv">
            <span className="muted">Holds</span>
            <span>
              {held || "Cash, waiting for a signal"}
              {held && summary.openPnl != null && <span className={tone(summary.openPnl)}> · open {signedUsd(summary.openPnl)}</span>}
            </span>
          </div>
          <div className="agent-panel__kv">
            <span className="muted">Last trade</span>
            <span>{lastTrade ? `${SIDE_LABELS[lastTrade.side]} ${lastTrade.symbol} ${ago(lastTrade.ts)}` : "None in 30 days"}</span>
          </div>
          <div className="agent-panel__kv">
            <span className="muted">Running for</span>
            <span>{daysText(recordDays(card))}</span>
          </div>
        </div>
      </div>

      <div className="agent-panel__foot">
        {card.copyable ? (
          <Link className="button button--ghost" href={`/studio?from=${summary.id}`}>
            <i className="ph ph-copy" aria-hidden="true" />
            Use these rules
          </Link>
        ) : (
          <button className="button button--ghost" type="button" disabled title="This agent uses settings the Studio can't set yet, so its rules can't be copied">
            <i className="ph ph-copy" aria-hidden="true" />
            Use these rules
          </button>
        )}
        <Link className="button button--primary" href={`/agents/${summary.id}`}>
          View agent
        </Link>
      </div>
    </>
  );
}
