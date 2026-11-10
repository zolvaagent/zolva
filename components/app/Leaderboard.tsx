"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentKindPills, matchesVenue, VENUE_FILTERS, type VenueFilter } from "@/components/app/AgentKind";
import type { AgentSummary } from "@/lib/data/agents";
import { marketList, percent, points, shortAddress, STRATEGY_NAMES, tone } from "@/lib/format";

const SORTS = [
  ["return", "Highest return"],
  ["edge", "Beat holding"],
  ["drawdown", "Smallest drop"],
] as const;

function age(createdAt: number): string {
  const days = Math.floor((Date.now() / 1000 - createdAt) / 86400);
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

/** `viewer` is the signed-in address, so their own agents get a "Your agent" label. */
export function Leaderboard({ agents, viewer = null }: { agents: AgentSummary[]; viewer?: string | null }) {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("return");
  const [filter, setFilter] = useState<VenueFilter>("all");

  const rows = useMemo(() => {
    const list = agents.filter((agent) => matchesVenue(agent, filter));
    const sorters = {
      return: (a: AgentSummary, b: AgentSummary) => b.returnPct - a.returnPct,
      edge: (a: AgentSummary, b: AgentSummary) => b.edge - a.edge,
      drawdown: (a: AgentSummary, b: AgentSummary) => a.maxDrawdownPct - b.maxDrawdownPct,
    };
    return list.sort(sorters[sort]);
  }, [agents, sort, filter]);

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
                  {rows.map((agent, i) => (
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
                      <td className={`num ${tone(agent.returnPct)}`}>{percent(agent.returnPct)}</td>
                      <td className={`num ${tone(agent.edge)}`}>{points(agent.edge)}</td>
                      <td className="num">{percent(-agent.maxDrawdownPct)}</td>
                      <td className="num">{agent.trades}</td>
                      <td className="muted">{age(agent.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="leader-cards only-mobile">
            {rows.map((agent, i) => (
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
                  <span className={tone(agent.returnPct)} style={{ fontWeight: 600 }}>
                    {percent(agent.returnPct)}
                  </span>
                  <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                    {points(agent.edge)}
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
