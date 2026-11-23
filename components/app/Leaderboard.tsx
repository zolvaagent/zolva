"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentKindPills, matchesVenue, VENUE_FILTERS, type VenueFilter } from "@/components/app/AgentKind";
import { isRankedRecord, MIN_RANKED_DAYS, MIN_RANKED_RUNS } from "@/lib/agents/tested";
import { statsFor, TIMEFRAMES, TOO_YOUNG, type Timeframe } from "@/lib/agents/periods";
import type { AgentSummary, PeriodStats } from "@/lib/data/agents";
import { marketList, percent, points, shortAddress, signedUsd, STRATEGY_NAMES, tone } from "@/lib/format";

const SORTS = [
  ["return", "Highest return"],
  ["edge", "Beat holding"],
  ["drawdown", "Smallest drop"],
] as const;


/** Days of live paper record: hourly runs / 24. */
const recordDays = (agent: AgentSummary) => Math.floor(agent.runs / 24);
const daysText = (days: number) => (days === 1 ? "1 day" : `${days} days`);

/**
 * Research's minimum track record: an agent is ranked, and shows risk numbers, only after 30 days and
 * 720 hourly runs (lib/agents/tested.ts).
 */
const isRanked = (agent: AgentSummary) => isRankedRecord(agent);

/** "Tested" (matches a rule that passed Research's 6 year test) or "Experiment" (everything else). */
function TestedPill({ agent }: { agent: AgentSummary }) {
  if (agent.tested === undefined) return null;
  return agent.tested ? (
    <span className="pill pill--running" title="Matches a rule that passed Research's 6 year backtest at this venue's cost">
      Tested
    </span>
  ) : (
    <span className="pill" title="Not a rule that passed Research's 6 year backtest">
      Experiment
    </span>
  );
}

/** `viewer` is the signed-in address, so their own agents get a "Your agent" label. */
export function Leaderboard({ agents, viewer = null }: { agents: AgentSummary[]; viewer?: string | null }) {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("return");
  const [filter, setFilter] = useState<VenueFilter>("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("all");

  const newcomers = useMemo(
    () => agents.filter((agent) => matchesVenue(agent, filter) && !isRanked(agent)).sort((a, b) => b.createdAt - a.createdAt),
    [agents, filter],
  );
  const rows = useMemo(() => {
    const list = agents.filter((agent) => matchesVenue(agent, filter) && isRanked(agent)).map((agent) => ({ agent, stats: statsFor(agent, timeframe) }));
    const key = (stats: PeriodStats) => (sort === "return" ? -stats.returnPct : sort === "edge" ? -stats.edge : stats.maxDrawdownPct);
    // Agents younger than the timeframe go last, newest first.
    return list.sort((a, b) => (a.stats && b.stats ? key(a.stats) - key(b.stats) : a.stats ? -1 : b.stats ? 1 : b.agent.createdAt - a.agent.createdAt));
  }, [agents, sort, filter, timeframe]);
  const tooYoung = timeframe === "all" ? "" : TOO_YOUNG[timeframe];
  const dash = (
    <span className="muted" title={tooYoung}>
      –
    </span>
  );

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
        <div className="tabs" role="tablist" aria-label="Timeframe">
          {TIMEFRAMES.map(([key, label]) => (
            <button key={key} className="tab" role="tab" type="button" aria-selected={timeframe === key} onClick={() => setTimeframe(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tabs" role="tablist" aria-label="Spot or perps">
          {VENUE_FILTERS.map(([key, label]) => (
            <button key={key} className="tab" role="tab" type="button" aria-selected={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!rows.length && !newcomers.length ? (
        <div className="card">
          <div className="empty">
            <img src="/img/icons/leaderboard.png" alt="" width={72} height={72} />
            <h2 className="card__title">No agents here yet</h2>
            <p>Agents appear after their first hour of trading. Build one in the Studio.</p>
            <Link className="button button--primary" href="/studio">
              Open the Studio
            </Link>
          </div>
        </div>
      ) : (
        <>
          {!rows.length && <p className="muted">No agent here has a {MIN_RANKED_DAYS} day record yet.</p>}
          {rows.length > 0 && (
            <>
              <div className="card only-desktop">
                <div className="table-wrap">
                  <table className="table table--clickable">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Agent</th>
                        <th>Strategy</th>
                        <th>Markets</th>
                        <th className="num">Return</th>
                        <th className="num">vs holding</th>
                        <th className="num">Worst drop</th>
                        <th className="num">Trades</th>
                        <th className="num">Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ agent, stats }, i) => (
                        <tr key={agent.id} className={agent.owner === viewer ? "leaderboard__mine" : undefined}>
                          <td className="rank">{i + 1}</td>
                          <td>
                            <Link className="row-link" href={`/agents/${agent.id}`}>{agent.name}</Link>
                            {agent.isHouse && (
                              <span className="pill" style={{ marginLeft: 6 }}>
                                by Zolva
                              </span>
                            )}
                            {agent.owner === viewer && (
                              <span className="pill pill--accent" style={{ marginLeft: 6 }}>
                                Your agent
                              </span>
                            )}
                            {/* Perps and Short sit on the second line, so a long name never pushes them into the next column. */}
                            <div className="leaderboard__sub">
                              <span className="muted mono">{agent.isHouse ? "House agent" : shortAddress(agent.owner)}</span>
                              <TestedPill agent={agent} />
                              <AgentKindPills agent={agent} />
                            </div>
                          </td>
                          <td>{STRATEGY_NAMES[agent.strategy]}</td>
                          <td className="muted" title={agent.tokens.map((token) => token.symbol).join(", ")}>
                            {marketList(agent.tokens.map((token) => token.symbol))}
                          </td>
                          <td className={`num ${stats ? tone(stats.returnPct) : ""}`}>{stats ? percent(stats.returnPct) : dash}</td>
                          <td className={`num ${stats ? tone(stats.edge) : ""}`}>{stats ? points(stats.edge) : dash}</td>
                          <td className="num">{stats ? percent(-stats.maxDrawdownPct) : dash}</td>
                          <td className="num">{agent.trades}</td>
                          <td className="num muted">{daysText(recordDays(agent))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="leader-cards only-mobile">
                {rows.map(({ agent, stats }, i) => (
                  <Link key={agent.id} className="leader-card" href={`/agents/${agent.id}`}>
                    <span className="rank">{i + 1}</span>
                    <span>
                      <strong>{agent.name}</strong>
                      <span className="pill-row">
                        <TestedPill agent={agent} />
                        <AgentKindPills agent={agent} />
                      </span>
                      <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                        {STRATEGY_NAMES[agent.strategy]} · {marketList(agent.tokens.map((token) => token.symbol))}
                      </div>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className={stats ? tone(stats.returnPct) : "muted"} style={{ fontWeight: 600 }} title={stats ? undefined : tooYoung}>
                        {stats ? percent(stats.returnPct) : "New"}
                      </span>
                      <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                        {stats ? points(stats.edge) : tooYoung}
                      </div>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {newcomers.length > 0 && (
            <section className="leaderboard-new" aria-labelledby="leaderboard-new-title">
              <h2 id="leaderboard-new-title" className="card__title">
                New agents
              </h2>
              <p className="muted">
                Not ranked yet. An agent joins the ranking after {MIN_RANKED_DAYS} days and {MIN_RANKED_RUNS} hourly runs; until then a short record says little.
              </p>
              <div className="leader-cards">
                {newcomers.map((agent) => (
                  <Link key={agent.id} className="leader-card leader-card--new" href={`/agents/${agent.id}`}>
                    <span>
                      <strong>{agent.name}</strong>
                      <span className="pill-row">
                        <TestedPill agent={agent} />
                        <AgentKindPills agent={agent} />
                      </span>
                      <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                        {STRATEGY_NAMES[agent.strategy]} · {marketList(agent.tokens.map((token) => token.symbol))}
                      </div>
                    </span>
                    {/* Return so far and open P&L only: no edge, drop or rank until the record is long enough. */}
                    <span style={{ textAlign: "right" }} title={`Too early to judge: ${daysText(recordDays(agent))} of ${MIN_RANKED_DAYS}`}>
                      <span style={{ fontSize: 14 }}>
                        <span className={tone(agent.returnPct)} style={{ fontWeight: 600 }}>
                          {percent(agent.returnPct)}
                        </span>
                        <span className="muted"> so far</span>
                      </span>
                      {agent.openPnl != null ? (
                        <div style={{ fontSize: 12, lineHeight: "16px" }}>
                          <span className="muted">open </span>
                          <span className={tone(agent.openPnl)}>{signedUsd(agent.openPnl)}</span>
                        </div>
                      ) : null}
                      <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                        New, {daysText(recordDays(agent))}
                      </div>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
