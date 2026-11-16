/**
 * The activity report: every agent's hourly check and every trade, grouped
 * by hour. Pure, so it is unit tested and can filter on the client.
 */

import type { TradePnl } from "./agents/trade-pnl";

export type ActivityHour = { ts: number; checked: number; buys: number; sells: number };

export type ActivityTrade = {
  ts: number;
  agentId: string;
  agentName: string;
  /** Run by Zolva (house or lab agent) rather than a user. */
  isHouse: boolean;
  strategy: string;
  symbol: string;
  side: "buy" | "sell" | "short" | "cover";
  quantity: number;
  price: number;
  costUsd: number;
  /** manual: sold by the owner of a live agent (Sell position). resize: a volatility sized position moved toward its target. */
  reason: "signal" | "stop_loss" | "take_profit" | "max_hold" | "manual" | "resize";
  reasoning: string | null;
  /** Set when the AI co-pilot reviewed this trade's signal (a trade means it approved). */
  ai?: { verdict: "approved" | "passed"; model: string } | null;
  /** The activity page only: realised P&L of a sell or cover, unrealised of a still-open buy or short (lib/agents/trade-pnl.ts). */
  pnl?: TradePnl | null;
};

/** A rule signal the AI co-pilot passed on: no trade happened. */
export type ActivityPass = {
  ts: number;
  agentId: string;
  agentName: string;
  isHouse: boolean;
  symbol: string;
  /** OpenRouter model id. */
  model: string;
  reasoning: string;
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

export type HourReport = ActivityHour & { trades: ActivityTrade[]; passes: ActivityPass[] };

/** One report per hour, newest first, each with that hour's trades and AI passes. */
export function hourlyReports(hours: ActivityHour[], trades: ActivityTrade[], passes: ActivityPass[] = []): HourReport[] {
  const byHour = new Map<number, ActivityTrade[]>();
  for (const trade of trades) byHour.set(trade.ts, [...(byHour.get(trade.ts) ?? []), trade]);
  const passesByHour = new Map<number, ActivityPass[]>();
  for (const pass of passes) passesByHour.set(pass.ts, [...(passesByHour.get(pass.ts) ?? []), pass]);
  return [...hours].sort((a, b) => b.ts - a.ts).map((hour) => ({ ...hour, trades: byHour.get(hour.ts) ?? [], passes: passesByHour.get(hour.ts) ?? [] }));
}

/** Plain words for why a trade happened. */
/** What a trade did, as a past tense verb for the feed. */
export const SIDE_VERBS: Record<ActivityTrade["side"], string> = { buy: "bought", sell: "sold", short: "shorted", cover: "covered" };

export const REASON_LABELS: Record<ActivityTrade["reason"], string> = {
  signal: "Rule met",
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  max_hold: "Max holding time",
  manual: "Sold by the owner",
  resize: "Daily resize",
};
