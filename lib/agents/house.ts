/**
 * Sita's own "house" agents: real paper agents run by Sita from launch day,
 * so the leaderboard has live track records before users arrive. They are
 * labelled "by Sita" everywhere. Configs are also used for the landing page
 * backtests, so what visitors see matches what actually runs.
 */
import { RULE_TEMPLATES, type Rules } from "../engine/rules.ts";
import type { StrategyKey } from "../engine/strategies.ts";

/** Owner address of the house agents (not a real wallet; nobody can sign for it). */
export const HOUSE_WALLET = "0x5174000000000000000000000000000000000000";

/**
 * Owners of the "Sita Lab" research agents. Like HOUSE_WALLET, nobody can
 * sign for them. Two owners because every owner may run at most 5 agents.
 */
export const LAB_WALLETS = ["0x5174000000000000000000000000000000000001", "0x5174000000000000000000000000000000000002"] as const;

const HOUSE_OWNERS = new Set<string>([HOUSE_WALLET, ...LAB_WALLETS]);

/** Whether an agent is run by Sita (house or lab), so the UI labels it "by Sita". */
export const isHouseOwner = (owner: string) => HOUSE_OWNERS.has(owner);

export type HouseAgent = {
  name: string;
  strategy: StrategyKey | "custom";
  rules?: Rules;
  symbols: string[];
  maxPositionPct: number;
  stopLossPct: number;
};

export const HOUSE_AGENTS: HouseAgent[] = [
  { name: "Big Tech Momentum", strategy: "momentum", symbols: ["META", "GOOGL", "AMZN"], maxPositionPct: 33, stopLossPct: 8 },
  { name: "Index Dip Buyer", strategy: "mean_reversion", symbols: ["SPY", "QQQ"], maxPositionPct: 50, stopLossPct: 5 },
  { name: "Chip Breakout", strategy: "custom", rules: RULE_TEMPLATES.breakout, symbols: ["NVDA", "MU", "TSM"], maxPositionPct: 33, stopLossPct: 8 },
  { name: "Meme Rebound", strategy: "mean_reversion", symbols: ["GME", "AMC"], maxPositionPct: 45, stopLossPct: 12 },
  { name: "Palantir Trend", strategy: "momentum", symbols: ["PLTR"], maxPositionPct: 80, stopLossPct: 9 },
];

/**
 * Buy oversold dips (24h RSI under 30), sell once momentum recovers.
 * Picked for trade count, not return: a 14h RSI traded ~45 times a month
 * on hourly data and lost most of its edge to costs; 24h trades ~13-16.
 */
const RSI_DIP: Rules = {
  entry: { join: "all", conditions: [{ left: { kind: "rsi", hours: 24 }, op: "below", right: { kind: "value", value: 30 } }] },
  exit: { join: "any", conditions: [{ left: { kind: "rsi", hours: 24 }, op: "above", right: { kind: "value", value: 55 } }] },
  takeProfitPct: 6,
  maxHoldHours: 72,
};

/**
 * Only buy a strong day (+3%) inside a 3 day uptrend; sell when price falls
 * 2% under the 72h average. A looser +1% / 24h version traded 55-80 times a
 * month in backtests; this one ~12-20.
 */
const TREND_FILTER: Rules = {
  entry: {
    join: "all",
    conditions: [
      { left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 72 } },
      { left: { kind: "change", hours: 24 }, op: "above", right: { kind: "value", value: 3 } },
    ],
  },
  exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 72, offsetPct: -2 } }] },
  takeProfitPct: null,
  maxHoldHours: null,
};

/**
 * Sita Lab: paper agents that exist to collect data on which strategies work.
 * The first owner runs five strategies on the same three stocks, a fair
 * side by side test; the second tries other baskets. Not on the landing page.
 */
export const LAB_AGENTS: (HouseAgent & { owner: (typeof LAB_WALLETS)[number] })[] = [
  { owner: LAB_WALLETS[0], name: "Lab · Trio Momentum", strategy: "momentum", symbols: ["NVDA", "TSLA", "AAPL"], maxPositionPct: 33, stopLossPct: 8 },
  { owner: LAB_WALLETS[0], name: "Lab · Trio Mean Reversion", strategy: "mean_reversion", symbols: ["NVDA", "TSLA", "AAPL"], maxPositionPct: 33, stopLossPct: 8 },
  { owner: LAB_WALLETS[0], name: "Lab · Trio Breakout", strategy: "custom", rules: RULE_TEMPLATES.breakout, symbols: ["NVDA", "TSLA", "AAPL"], maxPositionPct: 33, stopLossPct: 8 },
  { owner: LAB_WALLETS[0], name: "Lab · Trio RSI Dip", strategy: "custom", rules: RSI_DIP, symbols: ["NVDA", "TSLA", "AAPL"], maxPositionPct: 33, stopLossPct: 8 },
  { owner: LAB_WALLETS[0], name: "Lab · Trio Trend Filter", strategy: "custom", rules: TREND_FILTER, symbols: ["NVDA", "TSLA", "AAPL"], maxPositionPct: 33, stopLossPct: 8 },
  { owner: LAB_WALLETS[1], name: "Lab · Big Tech RSI Dip", strategy: "custom", rules: RSI_DIP, symbols: ["META", "GOOGL", "AMZN"], maxPositionPct: 33, stopLossPct: 8 },
  { owner: LAB_WALLETS[1], name: "Lab · Gold & Oil Momentum", strategy: "momentum", symbols: ["GLD", "USO"], maxPositionPct: 50, stopLossPct: 6 },
  { owner: LAB_WALLETS[1], name: "Lab · Crypto Stocks Dip", strategy: "mean_reversion", symbols: ["MSTR", "CRCL"], maxPositionPct: 45, stopLossPct: 12 },
  { owner: LAB_WALLETS[1], name: "Lab · Asia Trend Filter", strategy: "custom", rules: TREND_FILTER, symbols: ["BABA", "TSM"], maxPositionPct: 45, stopLossPct: 8 },
  { owner: LAB_WALLETS[1], name: "Lab · Growth Breakout", strategy: "custom", rules: RULE_TEMPLATES.breakout, symbols: ["PLTR", "RDDT", "SPCX"], maxPositionPct: 33, stopLossPct: 10 },
];
