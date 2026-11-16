"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentKindPills, matchesVenue, VENUE_FILTERS, type VenueFilter } from "@/components/app/AgentKind";
import type { AgentPeriod, AgentSummary, PeriodStats } from "@/lib/data/agents";
import { marketList, percent, points, shortAddress, STRATEGY_NAMES, tone } from "@/lib/format";

const SORTS = [
  ["return", "Highest return"],
  ["edge", "Beat holding"],
  ["drawdown", "Smallest drop"],
] as const;

/** Timeframes: the agent's last 24 hours, 7 days, 30 days, or everything since launch. */
const TIMEFRAMES = [
  ["24h", "24h"],
  ["7d", "7d"],
  ["30d", "30d"],
  ["all", "All time"],
] as const;
type Timeframe = AgentPeriod | "all";

/** The numbers ranked for a timeframe; null when the agent is younger than it. */
function statsFor(agent: AgentSummary, timeframe: Timeframe): PeriodStats | null {
  if (timeframe === "all") return { returnPct: agent.returnPct, edge: agent.edge, maxDrawdownPct: agent.maxDrawdownPct };
  return agent.periods?.[timeframe] ?? null;
}

const TOO_YOUNG: Record<AgentPeriod, string> = { "24h": "Running for less than 24 hours", "7d": "Running for less than 7 days", "30d": "Running for less than 30 days" };

function age(createdAt: number): string {
  const days = Math.floor((Date.now() / 1000 - createdAt) / 86400);
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

/** `viewer` is the signed-in address, so their own agents get a "Your agent" label. */
export function Leaderboard({ agents, viewer = null }: { agents: AgentSummary[]; viewer?: string | null }) {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("return");
  const [filter, setFilter] = useState<VenueFilter>("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("all");

  const rows = useMemo(() => {
    const list = agents.filter((agent) => matchesVenue(agent, filter)).map((agent) => ({ agent, stats: statsFor(agent, timeframe) }));
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

      {!rows.length ? (
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
                    <th>Started</th>
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
                      <td className="muted">{age(agent.createdAt)}</td>
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
    </>
  );
}
