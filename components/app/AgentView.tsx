"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/ui/Providers";
import { LineChart } from "@/components/ui/LineChart";
import type { AgentDetail } from "@/lib/data/agents";
import { describeCondition, type Rules } from "@/lib/engine/rules";
import { dateAt, dayAt, isMarketHours, percent, points, price, shortAddress, STRATEGY_NAMES, tone, usd } from "@/lib/format";

export type Preview = { startTs: number; equity: number[]; hold: number[]; returnPct: number; holdReturnPct: number } | null;

type Props = {
  detail: AgentDetail;
  isOwner: boolean;
  /** Latest close per token address. */
  prices: Record<string, number>;
  /** Same settings over the last 30 days, shown while the agent has no history yet. */
  preview: Preview;
  symbols: Record<string, string>;
};

const RANGES = { "7d": 7 * 24, "30d": 30 * 24, all: Infinity } as const;

export function AgentView({ detail, isOwner, prices, preview, symbols }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { agent, summary, runs, trades, positions } = detail;
  const [range, setRange] = useState<keyof typeof RANGES>("all");
  const [showHolds, setShowHolds] = useState(false);
  const [busy, setBusy] = useState(false);
  const minutesToNextRun = 60 - new Date().getUTCMinutes();
  const symbolOf = (token: string) => symbols[token] ?? token;

  const togglePause = async () => {
    setBusy(true);
    const status = agent.status === "active" ? "paused" : "active";
    const response = await fetch(`/api/agents/${agent.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return toast(body.error ?? "Updating failed. Please try again.");
    toast(status === "active" ? "Agent resumed. It continues from the next hour." : "Agent paused");
    router.refresh();
  };

  const share = () =>
    navigator.clipboard?.writeText(window.location.href).then(
      () => toast("Link copied"),
      () => toast("Copy failed. Copy the address bar instead."),
    );

  const rules = agent.params.rules as Rules | undefined;
  const settings: [string, React.ReactNode][] = [
    ["Strategy", STRATEGY_NAMES[agent.strategy]],
    ["Stocks", summary.tokens.map((token) => token.symbol).join(", ")],
    ["Starting capital", usd(summary.startCapital)],
    ["Max per stock", `${agent.params.max_position_pct}%`],
    ["Stop loss", `${agent.params.stop_loss_pct}%`],
    ...(rules?.takeProfitPct ? ([["Take profit", `${rules.takeProfitPct}%`]] as [string, string][]) : []),
    ...(rules?.maxHoldHours ? ([["Max holding time", `${rules.maxHoldHours} hours`]] as [string, string][]) : []),
    ["Owner", summary.isHouse ? "Sita (house agent)" : <span className="mono">{shortAddress(agent.owner)}</span>],
    ["Launched", dateAt(Date.parse(agent.created_at) / 1000)],
  ];

  const header = (
    <div className="agent-head">
      <div>
        <Link className="eyebrow" href={isOwner ? "/app" : "/leaderboard"} style={{ textDecoration: "none" }}>
          <i className="ph ph-arrow-left" />
          {isOwner ? "Dashboard" : "Leaderboard"}
        </Link>
        <h1 className="page__title" style={{ marginTop: "var(--space-100)" }}>
          {agent.name}
        </h1>
        <div className="agent-head__meta">
          {agent.status === "active" ? (
            <span className="pill pill--running">
              <span className="pulse" />
              Running
            </span>
          ) : (
            <span className="pill pill--paused">
              <i className="ph ph-pause" />
              Paused
            </span>
          )}
          {summary.isHouse && <span className="pill">by Sita</span>}
          <span>{STRATEGY_NAMES[agent.strategy]}</span>
          <span aria-hidden="true">·</span>
          <span>{summary.tokens.map((token) => token.symbol).join(", ")}</span>
          <span aria-hidden="true">·</span>
          <span>{agent.status === "active" ? `Next decision in ${minutesToNextRun} min` : "Not trading while paused"}</span>
        </div>
      </div>
      <div className="hero__actions">
        {isOwner && (
          <button className="button button--ghost" type="button" onClick={togglePause} disabled={busy}>
            <i className={`ph ${agent.status === "active" ? "ph-pause" : "ph-play"}`} />
            {agent.status === "active" ? "Pause" : "Resume"}
          </button>
        )}
        <button className="button button--ghost" type="button" onClick={share}>
          <i className="ph ph-share-network" />
          Share
        </button>
      </div>
    </div>
  );

  const settingsCard = (
    <div className="card">
      <h2 className="card__title" style={{ marginBottom: "var(--space-200)" }}>
        Settings
      </h2>
      <div className="stack stack--tight" style={{ fontSize: 14, lineHeight: "20px" }}>
        {settings.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-200)" }}>
            <span className="muted">{label}</span>
            <span style={{ textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>
      {rules && (
        <div className="stack stack--tight" style={{ marginTop: "var(--space-200)" }}>
          <strong style={{ fontSize: 14 }}>Buy when {rules.entry.join} of:</strong>
          <ul className="rule-summary">
            {rules.entry.conditions.map((condition, i) => (
              <li key={i}>{describeCondition(condition)}</li>
            ))}
          </ul>
          <strong style={{ fontSize: 14 }}>Sell when {rules.exit.join} of:</strong>
          <ul className="rule-summary">
            {rules.exit.conditions.length ? rules.exit.conditions.map((condition, i) => <li key={i}>{describeCondition(condition)}</li>) : <li>No rule: take profit, max holding time or stop loss</li>}
          </ul>
        </div>
      )}
    </div>
  );

  if (!runs.length) {
    return (
      <div className="container page">
        {header}
        <div className="agent-layout">
          <div className="stack">
            <div className="card">
              <div className="stat-grid">
                <Stat label="Value" value={usd(summary.startCapital)} />
                <Stat label="Return" value="0.0%" />
                <Stat label="Cash" value={usd(Number(agent.cash))} />
                <Stat label="Trades" value="0" />
              </div>
            </div>
            <div className="card">
              <div className="empty">
                <img src="/img/icons/backtest.png" alt="" width={72} height={72} />
                <h2 className="card__title">{agent.status === "active" ? "Waiting for the first decision" : "Paused before its first decision"}</h2>
                <p>
                  {agent.status === "active"
                    ? `The agent checks prices at the top of every hour, in about ${minutesToNextRun} minutes. Trades and reasoning show up here.`
                    : "Resume it and it starts deciding from the next hour."}
                </p>
              </div>
            </div>
          </div>
          <div className="stack">
            {preview && (
              <div className="card stack">
                <div>
                  <div className="eyebrow">While you wait</div>
                  <h2 className="card__title">These settings over the last 30 days</h2>
                </div>
                <LineChart startTs={preview.startTs} height={140} baseline={summary.startCapital} step={3} series={[{ label: "Backtest", values: preview.equity, color: "var(--color-text-muted)" }]} legend={false} />
                <div className={tone(preview.returnPct)} style={{ fontSize: 24, lineHeight: "32px", fontWeight: 600 }}>
                  {percent(preview.returnPct)}{" "}
                  <span className="muted" style={{ fontSize: 14, lineHeight: "20px", fontWeight: 400 }}>
                    vs holding {percent(preview.holdReturnPct)}
                  </span>
                </div>
              </div>
            )}
            {settingsCard}
          </div>
        </div>
      </div>
    );
  }

  const visible = runs.slice(Math.max(0, runs.length - RANGES[range]));
  const lastRun = runs[runs.length - 1];
  const logRuns = [...runs]
    .reverse()
    .filter((run) => showHolds || !summary.trades || run.decisions.some((decision) => decision.action !== "hold"))
    .slice(0, showHolds || !summary.trades ? 24 : 12);

  return (
    <div className="container page">
      {header}
      <div className="agent-layout">
        <div className="stack">
          <div className="card stack">
            <div className="stat-grid">
              <Stat label="Value" value={usd(summary.equity)} />
              <Stat label={`Return since ${dayAt(Date.parse(agent.created_at) / 1000)}`} value={percent(summary.returnPct)} className={tone(summary.returnPct)} />
              <Stat label="vs holding" value={points(summary.edge)} className={tone(summary.edge)} />
              <Stat label="Worst drop" value={percent(-summary.maxDrawdownPct)} />
            </div>
            <div className="card-head" style={{ margin: 0 }}>
              <h2 className="card__title">Value over time</h2>
              <div className="tabs" role="tablist" aria-label="Chart range">
                {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((key) => (
                  <button key={key} className="tab" role="tab" type="button" aria-selected={range === key} onClick={() => setRange(key)}>
                    {key === "all" ? "All" : key.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              startTs={visible[0].ts}
              height={240}
              baseline={summary.startCapital}
              series={[
                { label: "Agent", values: visible.map((run) => run.equity), color: "var(--color-purple-rich)" },
                { label: "Holding", values: visible.map((run) => run.holdEquity), color: "var(--color-hold-line)", dashed: true },
              ]}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Decision log</h2>
              {summary.trades ? (
                <label className="check">
                  <input type="checkbox" checked={showHolds} onChange={(event) => setShowHolds(event.target.checked)} />
                  Show hours with no trade
                </label>
              ) : (
                <span className="pill">Latest hours</span>
              )}
            </div>
            {logRuns.map((run) => (
              <div key={run.ts} className="log-run">
                <span className="log-run__time">
                  {dateAt(run.ts)}
                  {isMarketHours(run.ts) ? "" : " · DEX hours"}
                </span>
                {run.decisions.map((decision, i) => (
                  <DecisionRow key={i} symbol={symbolOf(decision.token)} action={decision.action} reasoning={decision.reasoning} />
                ))}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Trades</h2>
              <span className="muted" style={{ fontSize: 14, lineHeight: "20px" }}>
                {summary.trades} total, 0.5% cost each
              </span>
            </div>
            {trades.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Side</th>
                      <th>Stock</th>
                      <th className="num">Price</th>
                      <th className="num">Size</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, i) => (
                      <tr key={i}>
                        <td className="muted">{dateAt(trade.ts)}</td>
                        <td>
                          <span className={`decision__action decision__action--${trade.side}`}>{trade.side}</span>
                        </td>
                        <td>
                          <strong>{trade.symbol}</strong>
                        </td>
                        <td className="num">{price(trade.price)}</td>
                        <td className="num">{usd(trade.quantity * trade.price)}</td>
                        <td>
                          {trade.reason === "stop_loss" && <span className="pill pill--warn">Stop loss</span>}
                          {trade.reason === "take_profit" && <span className="pill pill--running">Take profit</span>}
                          {trade.reason === "max_hold" && <span className="pill">Max hold</span>}{" "}
                          {!isMarketHours(trade.ts) && (
                            <span className="pill" title="New York exchange closed. Price came from Robinhood Chain trading only.">
                              DEX hours
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <img src={`/img/icons/${agent.strategy === "mean_reversion" ? "mean-reversion" : agent.strategy === "custom" ? "backtest" : "momentum"}.png`} alt="" width={72} height={72} />
                <h3 className="card__title">Waiting for its moment</h3>
                <p>The agent only trades when its rules trigger. Every hour so far ended in a hold; the log above shows why.</p>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack stack--tight">
            <h2 className="card__title">Latest decision</h2>
            <span className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
              {dateAt(lastRun.ts)}
            </span>
            {lastRun.decisions.map((decision, i) => (
              <DecisionRow key={i} symbol={symbolOf(decision.token)} action={decision.action} reasoning={decision.reasoning} />
            ))}
          </div>
          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Holdings</h2>
              <span className="mono muted" style={{ fontSize: 14, lineHeight: "20px" }}>
                Cash {usd(lastRun.cash)}
              </span>
            </div>
            {positions.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Stock</th>
                      <th className="num">Entry</th>
                      <th className="num">Now</th>
                      <th className="num">P&amp;L</th>
                      <th className="num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => {
                      const now = prices[position.token] ?? position.entryPrice;
                      const change = (now / position.entryPrice - 1) * 100;
                      return (
                        <tr key={position.token}>
                          <td>
                            <strong>{position.symbol}</strong>
                          </td>
                          <td className="num">{price(position.entryPrice)}</td>
                          <td className="num">{price(now)}</td>
                          <td className={`num ${tone(change)}`}>{percent(change)}</td>
                          <td className="num">{usd(position.quantity * now)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="cash-state">
                <div className="cash-state__bar">
                  <span style={{ width: "100%" }} />
                </div>
                <div className="growth__row" style={{ border: 0, padding: 0 }}>
                  <span className="muted">Cash</span>
                  <strong>100%</strong>
                </div>
                <p className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
                  Fully in cash. It buys the moment its rules trigger.
                </p>
              </div>
            )}
          </div>
          {settingsCard}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${className}`}>{value}</span>
    </div>
  );
}

export function DecisionRow({ symbol, action, reasoning }: { symbol: string; action: string; reasoning: string }) {
  return (
    <div className="decision">
      <span className={`decision__action decision__action--${action}`}>{action}</span>
      <span>
        <strong>{symbol}</strong> <span className="muted">{reasoning}</span>
      </span>
    </div>
  );
}
