/**
 * Zolva's own "house" agents: real paper agents run by Zolva from launch day,
 * so the leaderboard has live track records before users arrive. They are
 * labelled "by Zolva" everywhere. Configs are also used for the landing page
 * backtests, so what visitors see matches what actually runs.
 */
import { RULE_TEMPLATES, type Rules } from "../engine/rules.ts";
import type { Venue, VolTargetSizing } from "../engine/engine.ts";
import type { StrategyKey } from "../engine/strategies.ts";

/** Owner address of the house agents (not a real wallet; nobody can sign for it). */
export const HOUSE_WALLET = "0x5174000000000000000000000000000000000000";

/**
 * Owners of the "Zolva Lab" research agents. Like HOUSE_WALLET, nobody can
 * sign for them. Several owners because every owner may run at most 5 agents.
 */
export const LAB_WALLETS = [
  "0x5174000000000000000000000000000000000001",
  "0x5174000000000000000000000000000000000002",
  "0x5174000000000000000000000000000000000003",
  "0x5174000000000000000000000000000000000004",
  "0x5174000000000000000000000000000000000005",
  "0x5174000000000000000000000000000000000006",
] as const;

const HOUSE_OWNERS = new Set<string>([HOUSE_WALLET, ...LAB_WALLETS]);

/** Whether an agent is run by Zolva (house or lab), so the UI labels it "by Zolva". */
export const isHouseOwner = (owner: string) => HOUSE_OWNERS.has(owner);

export type HouseAgent = {
  name: string;
  strategy: StrategyKey | "custom";
  rules?: Rules;
  symbols: string[];
  maxPositionPct: number;
  stopLossPct: number;
  /** Missing: the DEX. */
  venue?: Venue;
  /** Leveraged short size (bounce_short on perps only); missing means 1x. */
  leverage?: number;
  /** Volatility sizing (custom rules on perps only); missing means the fixed max position share. */
  sizing?: VolTargetSizing;
  /** An AI co-pilot model id (lib/ai/models.ts); missing: rules only. */
  aiModel?: string;
  /** The co-pilot's spending limit in USD and its end date (ISO), like a user's agent. */
  aiLimitUsd?: number;
  aiUntil?: string;
};

/**
 * Long while the price is more than 3% above its 1,200 hour (50 day) average; out once it is
 * below the average. Used with volatility sizing (20% target, 720 hours) on alt perps.
 */
export const VOL_TREND_1200: Rules = {
  entry: { join: "all", conditions: [{ left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 1200, offsetPct: 3 } }] },
  exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 1200 } }] },
  takeProfitPct: null,
  maxHoldHours: null,
};

/**
 * Buy a deep dip against the 96h average (z under -2.5), sell once the price is back
 * above it (z 0.5). Found in the perps rule search: positive in all 3 training folds
 * and in the held-out month on BTC, ETH and SOL perps (docs/perps-research.md).
 */
export const DEEP_DIP_96: Rules = {
  entry: { join: "all", conditions: [{ left: { kind: "zscore", hours: 96 }, op: "below", right: { kind: "value", value: -2.5 } }] },
  exit: { join: "any", conditions: [{ left: { kind: "zscore", hours: 96 }, op: "above", right: { kind: "value", value: 0.5 } }] },
  takeProfitPct: null,
  maxHoldHours: null,
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
export const RSI_DIP: Rules = {
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
export const TREND_FILTER: Rules = {
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
 * Zolva Lab: paper agents that exist to collect data on which strategies work.
 * The first owner runs five strategies on the same three stocks, a fair
 * side by side test; the second tries other baskets; the third runs the same
 * five strategies on ETH and BTC (added 2026-10-24 with crypto markets; in a
 * 30 day backtest to Oct 24 mean reversion and RSI dip lost least while
 * holding fell 7.5%, breakout did worst). Lab · Dip Hunter (2026-11-03) watches
 * all 14 live-tradable markets and holds one at a time (docs/down-market-research.md).
 * Lab · Crypto Spike Fade (2026-11-03) is the first agent that shorts, paper only
 * (docs/shorting-research.md).
 * Not on the landing page.
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
  { owner: LAB_WALLETS[2], name: "Lab · Crypto Momentum", strategy: "momentum", symbols: ["ETH", "BTC"], maxPositionPct: 50, stopLossPct: 10 },
  { owner: LAB_WALLETS[2], name: "Lab · Crypto Mean Reversion", strategy: "mean_reversion", symbols: ["ETH", "BTC"], maxPositionPct: 50, stopLossPct: 10 },
  { owner: LAB_WALLETS[2], name: "Lab · Crypto Breakout", strategy: "custom", rules: RULE_TEMPLATES.breakout, symbols: ["ETH", "BTC"], maxPositionPct: 50, stopLossPct: 10 },
  { owner: LAB_WALLETS[2], name: "Lab · Crypto RSI Dip", strategy: "custom", rules: RSI_DIP, symbols: ["ETH", "BTC"], maxPositionPct: 50, stopLossPct: 10 },
  { owner: LAB_WALLETS[2], name: "Lab · Crypto Trend Filter", strategy: "custom", rules: TREND_FILTER, symbols: ["ETH", "BTC"], maxPositionPct: 50, stopLossPct: 10 },
  {
    // Own owner: each owner may run at most 5 active paper agents.
    owner: LAB_WALLETS[3],
    name: "Lab · Dip Hunter",
    strategy: "dip_hunter",
    symbols: ["AAPL", "AMZN", "BTC", "CRCL", "ETH", "GLD", "GME", "GOOGL", "MU", "NVDA", "QQQ", "RDDT", "SPCX", "USO"],
    maxPositionPct: 100,
    stopLossPct: 10,
  },
  // Spot short (simulated borrow). Paused on 2026-11-10 when spot became long only; kept for
  // its record. The database now refuses new spot shorts (agents_spot_no_shorts), so this
  // entry only matches the existing row and is never created again.
  { owner: LAB_WALLETS[3], name: "Lab · Crypto Spike Fade", strategy: "spike_fade", symbols: ["ETH", "BTC"], maxPositionPct: 100, stopLossPct: 10 },
  {
    // Its replacement: the same preset and settings on BTC and ETH perps, where a short is
    // native (0.05% per trade plus funding, no borrow rate). Engine check on Lighter history
    // Jul 8 to Nov 10: +5.0% (holding +18.4%), +7.2% in the last 30 days (holding -12.3%),
    // worst drop 20.7% in the July to August rise.
    owner: LAB_WALLETS[3],
    name: "Lab · Perps Spike Fade",
    strategy: "spike_fade",
    symbols: ["ETH-PERP", "BTC-PERP"],
    maxPositionPct: 100,
    stopLossPct: 10,
    venue: "perps",
  },
  {
    // Perps on Lighter (Robinhood Chain), paper only: the one rule that passed the perps
    // search and its held-out month (docs/perps-research.md, "Rule search").
    owner: LAB_WALLETS[3],
    name: "Lab · Perps Deep Dip",
    strategy: "custom",
    rules: DEEP_DIP_96,
    symbols: ["BTC-PERP", "ETH-PERP", "SOL-PERP"],
    maxPositionPct: 33,
    stopLossPct: 5,
    venue: "perps",
  },
  {
    // The same rule on five crypto perps the search never saw, to gather trades faster:
    // +19.4% from Jul 8 to Nov 10 and +10.8% in the last 30 days while holding fell 16%.
    owner: LAB_WALLETS[3],
    name: "Lab · Perps Deep Dip Alts",
    strategy: "custom",
    rules: DEEP_DIP_96,
    symbols: ["HYPE-PERP", "ZEC-PERP", "XRP-PERP", "LIT-PERP", "NEAR-PERP"],
    maxPositionPct: 20,
    stopLossPct: 5,
    venue: "perps",
  },
  // Co-pilot twin (2026-11-11): the same RSI dip rule and markets, started in the same hour,
  // once on rules alone and once with the AI co-pilot (DeepSeek V4.1 Flash, no creator note),
  // so the two records show whether the co-pilot's passes help. The rule catches falling
  // knives in a down market (Oct 12 to Nov 11 backtest: -8.8% on 23 buys, holding -6.9%), the
  // case the co-pilot is meant to filter. AI paid from this owner's credits, at most $1.
  { owner: LAB_WALLETS[4], name: "Twin · RSI Dip", strategy: "custom", rules: RSI_DIP, symbols: ["NVDA", "TSLA", "AAPL"], maxPositionPct: 33, stopLossPct: 8 },
  {
    owner: LAB_WALLETS[4],
    name: "Twin · RSI Dip + AI",
    strategy: "custom",
    rules: RSI_DIP,
    symbols: ["NVDA", "TSLA", "AAPL"],
    maxPositionPct: 33,
    stopLossPct: 8,
    aiModel: "deepseek/deepseek-v4.1-flash",
    aiLimitUsd: 1,
    aiUntil: "2026-12-31T23:59:59Z",
  },
  {
    // Long and short in one agent (2026-11-11): one long slot and one short slot with the 7
    // day trend filter, on all eight crypto perps, half the agent per side. Engine check on
    // Lighter history Jul 8 to Nov 11: +27.3% (holding +31.5%), worst drop 9.6%, 71 round
    // trips; +14.8% in the last 30 days while holding fell 21%. The filter and the basket were
    // picked on that same data, so this paper agent is the out-of-sample test
    // (docs/perps-research.md, "Long and short in one agent").
    owner: LAB_WALLETS[4],
    name: "Lab · Perps Dip + Fade",
    strategy: "dip_fade",
    symbols: ["BTC-PERP", "ETH-PERP", "SOL-PERP", "HYPE-PERP", "ZEC-PERP", "XRP-PERP", "LIT-PERP", "NEAR-PERP"],
    maxPositionPct: 50,
    stopLossPct: 10,
    venue: "perps",
  },
  {
    // Short the bounce in a downtrend (2026-11-13): one short at a time, all of the agent, on the
    // eight crypto perps. Backtest on Lighter history (scripts/research-short-trend.mts, 1x,
    // 0.05% cost, 10% stop): +6.8% in the last 6 days (holding -14.3%), +14.4% / +14.0% / +7.6% in
    // the three 30 day windows before it (holding -12.1% / +18.8% / +54.4%), worst drop 7.3%,
    // but only 4 to 11 trades per window. The 24 hour guard (no short after a rise above 1.5%)
    // was chosen after seeing the rally window fail without it, so this paper agent is the
    // out-of-sample test. Aggressive on purpose: one slot, full size.
    owner: LAB_WALLETS[4],
    name: "Lab · Perps Bounce Short",
    strategy: "bounce_short",
    symbols: ["BTC-PERP", "ETH-PERP", "SOL-PERP", "HYPE-PERP", "ZEC-PERP", "XRP-PERP", "LIT-PERP", "NEAR-PERP"],
    maxPositionPct: 100,
    stopLossPct: 10,
    venue: "perps",
  },
  {
    // The same rule at 3x (2026-11-13), to compare against the 1x agent above on the same hours.
    // Backtest at 3x with a 5% stop, hourly closes only (wicks inside an hour are not modelled):
    // +21.3% / +27.7% / +46.4% / +24.1% over the four windows, worst drop 6% to 21%
    // (docs/perps-research.md, "Bounce short with leverage"). A 5% stop costs 15% of the margin.
    owner: LAB_WALLETS[4],
    name: "Lab · Perps Bounce Short 3x",
    strategy: "bounce_short",
    symbols: ["BTC-PERP", "ETH-PERP", "SOL-PERP", "HYPE-PERP", "ZEC-PERP", "XRP-PERP", "LIT-PERP", "NEAR-PERP"],
    maxPositionPct: 100,
    stopLossPct: 5,
    venue: "perps",
    leverage: 3,
  },
  // Volatility sized trend filter on alt perps (2026-11-14), one market per agent. Passed the
  // pre-registered rule on 4 of 4 coins on Binance history 2020-2026 (docs/perps-research.md,
  // "Round 2 on alt perps"; scripts/research-alt-volsize.mts). Frozen: do not tune. Expect mostly
  // cash (about 15% to 25% of equity when in), small yearly returns and small drops.
  ...(["SOL", "XRP", "NEAR", "ZEC"] as const).map((coin) => ({
    owner: LAB_WALLETS[5],
    name: `Lab · ${coin} Vol Trend`,
    strategy: "custom" as const,
    rules: VOL_TREND_1200,
    symbols: [`${coin}-PERP`],
    maxPositionPct: 100,
    stopLossPct: 15,
    venue: "perps" as const,
    sizing: { kind: "volTarget" as const, targetPct: 20, hours: 720 },
  })),
];
