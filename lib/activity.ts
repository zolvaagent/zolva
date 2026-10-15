/**
 * The activity report: every agent's hourly check and every trade, grouped
 * by hour. Pure, so it is unit tested and can filter on the client.
 */

export type ActivityHour = { ts: number; checked: number; buys: number; sells: number };

export type ActivityTrade = {
  ts: number;
  agentId: string;
  agentName: string;
  /** Run by Sita (house or lab agent) rather than a user. */
  isHouse: boolean;
  strategy: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  costUsd: number;
  reason: "signal" | "stop_loss" | "take_profit" | "max_hold";
  reasoning: string | null;
};

export type ActivitySummary = {
  /** Agent checks (one agent deciding on one hour). */
  checks: number;
  buys: number;
  sells: number;
  /** Paper money traded, in USD. */
  volumeUsd: number;
  /** Most traded stock and its trade count, or null with no trades. */
  topSymbol: { symbol: string; trades: number } | null;
};

/** Totals for the hours at or after `fromTs` (unix seconds). */
export function summarize(hours: ActivityHour[], trades: ActivityTrade[], fromTs: number): ActivitySummary {
  const recentTrades = trades.filter((trade) => trade.ts >= fromTs);
  const bySymbol = new Map<string, number>();
  for (const trade of recentTrades) bySymbol.set(trade.symbol, (bySymbol.get(trade.symbol) ?? 0) + 1);
  const top = [...bySymbol].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    checks: hours.filter((hour) => hour.ts >= fromTs).reduce((sum, hour) => sum + hour.checked, 0),
    buys: recentTrades.filter((trade) => trade.side === "buy").length,
    sells: recentTrades.filter((trade) => trade.side === "sell").length,
    volumeUsd: recentTrades.reduce((sum, trade) => sum + trade.quantity * trade.price, 0),
    topSymbol: top ? { symbol: top[0], trades: top[1] } : null,
  };
}

export type HourReport = ActivityHour & { trades: ActivityTrade[] };

/** One report per hour, newest first, each with that hour's trades. */
export function hourlyReports(hours: ActivityHour[], trades: ActivityTrade[]): HourReport[] {
  const byHour = new Map<number, ActivityTrade[]>();
  for (const trade of trades) byHour.set(trade.ts, [...(byHour.get(trade.ts) ?? []), trade]);
  return [...hours].sort((a, b) => b.ts - a.ts).map((hour) => ({ ...hour, trades: byHour.get(hour.ts) ?? [] }));
}

/** Plain words for why a trade happened. */
export const REASON_LABELS: Record<ActivityTrade["reason"], string> = {
  signal: "Rule met",
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  max_hold: "Max holding time",
};
