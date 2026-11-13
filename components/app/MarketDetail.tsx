"use client";

import Link from "next/link";
import { useState } from "react";

import { LighterBadge } from "@/components/ui/LighterBadge";
import { LineChart } from "@/components/ui/LineChart";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { EXPLORER_URL } from "@/lib/chain";
import type { AgentSummary } from "@/lib/data/agents";
import type { MarketRow } from "@/lib/data/markets";
import { blocksTrading, HARMONIC_URL, sessionCheckedAt, sessionDetail, sessionLabel, type TokenSession } from "@/lib/harmonic";
import type { LongbowListing } from "@/lib/longbow";
import { dateAt, fundingYearly, percent, points, price, shortAddress, STRATEGY_NAMES, tone } from "@/lib/format";

const RANGES = [
  { key: "24h", label: "24h", hours: 24, step: 1 },
  { key: "7d", label: "7d", hours: 168, step: 2 },
  { key: "30d", label: "30d", hours: 720, step: 6 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${className ?? ""}`}>{value}</span>
    </div>
  );
}

const signed = (value: number | null) => (value === null ? "–" : percent(value));

export function MarketDetail({
  row,
  closes,
  startTs,
  asOf,
  marketOpen,
  agents,
  session = null,
  longbow = null,
}: {
  row: MarketRow;
  closes: number[];
  startTs: number;
  asOf: number;
  marketOpen: boolean;
  agents: AgentSummary[];
  /** Stock Tokens only: the issuer's trading status from Harmonic's session oracle; null when unknown. */
  session?: TokenSession | null;
  /** Longbow's USDG lending market for this token (matched by address); null hides the line. */
  longbow?: LongbowListing | null;
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const range = RANGES.find((item) => item.key === rangeKey)!;
  // One more point than the range, so "24h" spans 24 full hours.
  const from = Math.max(0, closes.length - range.hours - 1);
  const values = closes.slice(from);
  const rangeChange = values.length > 1 ? (values[values.length - 1] / values[0] - 1) * 100 : null;
  const { stats } = row;
  const poolUrl = `https://www.geckoterminal.com/robinhood/pools/${row.pool}`;
  const perps = row.venue === "lighter";
  const base = row.symbol.replace(/-PERP$/, "");

  return (
    <div className="stack">
      <div className="agent-head">
        <div>
          <Link className="eyebrow" href="/markets" style={{ textDecoration: "none" }}>
            <i className="ph ph-arrow-left" />
            Markets
          </Link>
          <div className="market-title">
            <TickerAvatar symbol={row.symbol} size={44} />
            <div>
              <h1 className="page__title">{row.symbol}</h1>
              <span className="muted">{row.name}</span>
            </div>
          </div>
          <div className="market-price">
            <strong>{price(stats.price)}</strong>
            <span className={tone(stats.change24h ?? 0)}>{signed(stats.change24h)} in 24h</span>
          </div>
          <div className="agent-head__meta">
            {perps ? (
              <span className="pill pill--accent">Perp · Lighter</span>
            ) : null}
            {row.assetClass === "crypto" ? (
              <span className="pill pill--running">Trades 24/7</span>
            ) : (
              <span className={`pill ${marketOpen ? "pill--running" : "pill--paused"}`}>{marketOpen ? "US market open" : "US market closed"}</span>
            )}
            {session && blocksTrading(session.verdict) ? (
              <span className="pill pill--paused" title={session.reason}>
                {sessionLabel(session.verdict)}
              </span>
            ) : null}
            <span>As of {dateAt(asOf)}</span>
          </div>
        </div>
        <div className="hero__actions">
          {perps ? (
            <span className="pill" title="The Studio builds spot agents; perps run on paper with Zolva's Lab agents for now">
              Lab agents only for now
            </span>
          ) : (
            <Link className="button button--primary" href={`/studio?stock=${row.symbol}`}>
              Build an agent for {row.symbol}
              <i className="ph ph-arrow-right" />
            </Link>
          )}
        </div>
      </div>

      <div className="agent-layout">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2 className="card__title">Price</h2>
                {rangeChange !== null && (
                  <span className={tone(rangeChange)} style={{ fontSize: 14, lineHeight: "20px" }}>
                    {percent(rangeChange)} over {range.label}
                  </span>
                )}
              </div>
              <div className="tabs" role="tablist" aria-label="Chart range">
                {RANGES.map((item) => (
                  <button key={item.key} className="tab" role="tab" type="button" aria-selected={rangeKey === item.key} onClick={() => setRangeKey(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              startTs={startTs + from * 3600}
              height={260}
              step={range.step}
              legend={false}
              series={[{ label: row.symbol, values, color: rangeChange !== null && rangeChange < 0 ? "var(--color-loss)" : "var(--color-purple-rich)" }]}
            />
          </div>

          <div className="stat-grid">
            <Stat label="1 hour" value={signed(stats.change1h)} className={tone(stats.change1h ?? 0)} />
            <Stat label="7 days" value={signed(stats.change7d)} className={tone(stats.change7d ?? 0)} />
            <Stat label="30 days" value={signed(stats.change30d)} className={tone(stats.change30d ?? 0)} />
            <Stat label="Typical hourly move" value={stats.hourlyMovePct === null ? "–" : `±${stats.hourlyMovePct.toFixed(2)}%`} />
            <Stat label="7 day high" value={price(stats.high7d)} />
            <Stat label="7 day low" value={price(stats.low7d)} />
            <Stat label="Agents trading it" value={row.agents} />
            {perps ? (
              <>
                <Stat label="Funding now" value={fundingYearly(row.funding?.lastYearly)} />
                <Stat label="Funding, 7 day average" value={fundingYearly(row.funding?.weekYearly)} />
              </>
            ) : (
              <Stat label="Pool" value={`Uniswap ${row.poolKind}`} />
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Agents trading {row.symbol}</h2>
              <Link className="text-link" href="/leaderboard">
                Leaderboard
              </Link>
            </div>
            {agents.length ? (
              <div className="stack stack--tight">
                {agents.slice(0, 6).map((agent) => (
                  <Link key={agent.id} className="market-agent" href={`/agents/${agent.id}`}>
                    <span>
                      <strong>{agent.name}</strong>
                      <span className="market-name">
                        {STRATEGY_NAMES[agent.strategy]} · {agent.isHouse ? "by Zolva" : shortAddress(agent.owner)}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className={tone(agent.returnPct)} style={{ fontWeight: 600 }}>
                        {percent(agent.returnPct)}
                      </span>
                      <span className="market-name">{points(agent.edge)} vs holding</span>
                    </span>
                  </Link>
                ))}
                {agents.length > 6 && <p className="note">And {agents.length - 6} more on the leaderboard.</p>}
              </div>
            ) : (
              <div className="empty" style={{ padding: "var(--space-300) 0" }}>
                <p>{perps ? `No Lab agent trades ${row.symbol} yet.` : `No agent trades ${row.symbol} yet. Yours could be the first.`}</p>
                {!perps && (
                  <Link className="button button--ghost button--small" href={`/studio?stock=${row.symbol}`}>
                    Open the Studio
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card__title" style={{ marginBottom: "var(--space-200)" }}>
              About this price
            </h2>
            {perps ? (
              <div className="stack stack--tight" style={{ fontSize: 14, lineHeight: "20px" }}>
                <p className="muted">
                  {row.symbol} is a perpetual future on Lighter&apos;s exchange on Robinhood Chain, settled in USDG. Zolva reads its hourly close and funding from Lighter&apos;s public API. A perp follows {base}&apos;s index price and can be held long or short; funding moves money between the two sides every hour (positive: longs pay shorts).
                </p>
                <p className="muted">Zolva&apos;s perps agents trade on paper only, with no leverage: 0.05% per trade plus the real hourly funding.</p>
                <a className="text-link" href={`https://robinhoodchain.lighter.xyz/trade/${base}`} target="_blank" rel="noopener noreferrer">
                  {base} perp on Lighter <i className="ph ph-arrow-up-right" />
                </a>
                <LighterBadge height={28} />
              </div>
            ) : (
            <div className="stack stack--tight" style={{ fontSize: 14, lineHeight: "20px" }}>
              {row.assetClass === "crypto" ? (
                <p className="muted">
                  Zolva reads {row.symbol} once an hour from its USDG pool on Robinhood Chain and checks it against Chainlink&apos;s {row.symbol} / USD price. If the two differ by more than 2%, that hour is skipped. Agents decide on exactly these prices.
                </p>
              ) : (
                <p className="muted">
                  Zolva reads {row.symbol} once an hour from its deepest USDG pool on Robinhood Chain. Agents decide on exactly these prices. They track the real stock closely during US trading hours and can drift when Nasdaq is closed.
                </p>
              )}
              <a className="text-link" href={`${EXPLORER_URL}/token/${row.address}`} target="_blank" rel="noopener noreferrer">
                Token contract {shortAddress(row.address)} <i className="ph ph-arrow-up-right" />
              </a>
              <a className="text-link" href={poolUrl} target="_blank" rel="noopener noreferrer">
                Price pool on GeckoTerminal <i className="ph ph-arrow-up-right" />
              </a>
              {row.assetClass === "crypto" ? (
                <p className="note">
                  <i className="ph ph-seal-check" aria-hidden="true" /> This address is on Chainlink&apos;s CCIP token list for Robinhood Chain{row.symbol === "BTC" ? " (Coinbase Wrapped BTC)" : row.symbol === "ETH" ? " (WETH)" : ""}.
                </p>
              ) : row.verifiedOfficial ? (
                <p className="note">
                  <i className="ph ph-seal-check" aria-hidden="true" /> This address is on Robinhood&apos;s official Stock Token list.
                </p>
              ) : (
                <p className="note">This token address is not yet checked against Robinhood&apos;s official Stock Token list.</p>
              )}
              {session ? (
                // Hover or focus shows the tooltip; it explains the status in plain words.
                <div className="session-note">
                  <p className="note">
                    <i className={`ph ${blocksTrading(session.verdict) ? "ph-pause-circle" : "ph-pulse"}`} aria-hidden="true" />
                    <span>
                      <span className="session-note__status" tabIndex={0} aria-describedby="session-tip">
                        Issuer status: {sessionLabel(session.verdict)}
                      </span>
                      {" · "}
                      <a className="session-note__link" href={HARMONIC_URL} target="_blank" rel="noopener noreferrer" title="Harmonic session oracle">
                        Harmonic
                      </a>
                    </span>
                  </p>
                  <div className="session-note__tip" id="session-tip" role="tooltip">
                    <strong>{sessionLabel(session.verdict)}</strong>
                    <span>{sessionDetail(session.verdict, row.symbol)}</span>
                    <span className="session-note__meta">Checked {sessionCheckedAt(session.at)} · Harmonic session oracle</span>
                  </div>
                </div>
              ) : null}
              {longbow ? (
                // Listing and LLTV only: Longbow's available liquidity on these tokens is too small to show.
                <p className="note">
                  <i className="ph ph-bank" aria-hidden="true" />
                  <span>
                    Longbow lists a market for this token · LLTV {Number((longbow.lltv * 100).toFixed(1))}%{" · "}
                    <a className="session-note__link" href={longbow.url} target="_blank" rel="noopener noreferrer" title="Longbow, Morpho Blue lending on Robinhood Chain">
                      Longbow
                    </a>
                  </span>
                </p>
              ) : null}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
