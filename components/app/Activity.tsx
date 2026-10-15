"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { hourlyReports, REASON_LABELS, type ActivityHour, type ActivityTrade, type HourReport } from "@/lib/activity";
import { dateAt, price, STRATEGY_NAMES, usd } from "@/lib/format";

const FILTERS = [
  ["all", "All agents"],
  ["house", "By Zolva"],
  ["community", "Community"],
] as const;

type Filter = (typeof FILTERS)[number][0];

/** Quiet hours in a row collapse into one line, so the report reads like a log, not a wall. */
type Block = { kind: "hour"; report: HourReport } | { kind: "quiet"; from: number; to: number; hours: number; checks: number };

function blocks(reports: HourReport[]): Block[] {
  const out: Block[] = [];
  for (const report of reports) {
    const last = out[out.length - 1];
    if (report.trades.length) out.push({ kind: "hour", report });
    else if (last?.kind === "quiet") {
      last.from = report.ts;
      last.hours += 1;
      last.checks += report.checked;
    } else out.push({ kind: "quiet", from: report.ts, to: report.ts, hours: 1, checks: report.checked });
  }
  return out;
}

const hourLabel = (ts: number) => dateAt(ts).replace(" UTC", "");

function TradeRow({ trade }: { trade: ActivityTrade }) {
  const notional = trade.quantity * trade.price;
  return (
    <li className="activity-trade">
      <TickerAvatar symbol={trade.symbol} />
      <div className="activity-trade__body">
        <p className="activity-trade__line">
          <Link href={`/agents/${trade.agentId}`}>{trade.agentName}</Link>
          {trade.isHouse && <span className="pill">by Zolva</span>}{" "}
          <span className={trade.side === "buy" ? "gain" : "loss"}>{trade.side === "buy" ? "bought" : "sold"}</span>{" "}
          <Link href={`/markets/${trade.symbol}`}>
            <strong>{trade.symbol}</strong>
          </Link>
        </p>
        <p className="activity-trade__why">
          <span className="pill pill--accent">{REASON_LABELS[trade.reason]}</span> {trade.reasoning ?? (trade.side === "buy" ? "Bought." : "Sold.")}
        </p>
      </div>
      <div className="activity-trade__amount">
        <strong>{usd(notional)}</strong>
        <span className="market-name">at {price(trade.price)}</span>
        <span className="market-name">{STRATEGY_NAMES[trade.strategy] ?? trade.strategy}</span>
      </div>
    </li>
  );
}

export function Activity({ hours, trades }: { hours: ActivityHour[]; trades: ActivityTrade[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const list = useMemo(() => {
    const visible = trades.filter((trade) => filter === "all" || (filter === "house" ? trade.isHouse : !trade.isHouse));
    return blocks(hourlyReports(hours, visible));
  }, [hours, trades, filter]);

  const hasTrades = list.some((block) => block.kind === "hour");

  return (
    <>
      <div className="filter-row">
        <div className="tabs" role="tablist" aria-label="Agents">
          {FILTERS.map(([key, label]) => (
            <button key={key} className="tab" role="tab" type="button" aria-selected={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
          Last 48 hours, newest first
        </span>
      </div>

      {!list.length ? (
        <div className="card">
          <div className="empty">
            <h2 className="card__title">No agent has run yet</h2>
            <p>Agents check the market once an hour. The first report appears after the next hourly run.</p>
          </div>
        </div>
      ) : (
        <ol className="activity">
          {list.map((block) =>
            block.kind === "quiet" ? (
              <li key={`q-${block.to}`} className="activity-quiet">
                <span className="activity-dot" aria-hidden="true" />
                <span>
                  <strong>{block.hours === 1 ? hourLabel(block.to) : `${hourLabel(block.from)} to ${hourLabel(block.to)}`}</strong>
                  <span className="muted">
                    {" "}
                    · {block.hours === 1 ? "1 hour" : `${block.hours} hours`}, {block.checks} agent checks, no trades{filter !== "all" ? " in this view" : ""}
                  </span>
                </span>
              </li>
            ) : (
              <li key={block.report.ts} className="activity-hour">
                <div className="activity-hour__head">
                  <span className="activity-dot activity-dot--live" aria-hidden="true" />
                  <span>
                    <strong>{dateAt(block.report.ts)}</strong>
                    <span className="muted">
                      {" "}
                      · {block.report.checked} agents checked · {block.report.trades.filter((trade) => trade.side === "buy").length} bought ·{" "}
                      {block.report.trades.filter((trade) => trade.side === "sell").length} sold
                    </span>
                  </span>
                </div>
                <ul className="activity-trades">
                  {block.report.trades.map((trade) => (
                    <TradeRow key={`${trade.agentId}-${trade.symbol}-${trade.side}`} trade={trade} />
                  ))}
                </ul>
              </li>
            ),
          )}
        </ol>
      )}
      {!hasTrades && list.length > 0 && (
        <p className="note" style={{ marginTop: "var(--space-200)" }}>
          Agents only trade when their rules are met, so quiet hours are normal. Most strategies trade a few times a week.
        </p>
      )}
    </>
  );
}
