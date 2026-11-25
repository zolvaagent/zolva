import { describe, expect, it } from "vitest";

import { checkFill, clientOrderIndex, drawdownPause, engineStateFromLighter, lighterOrderFor, limitPortfolioOrder, marginFractionFor, parseAccount, parseMarket, planOrder, reconcile, type LighterMarket } from "./lighter";
import { equityAt } from "../engine/engine";

// Trimmed real bodies from api.rh.lighter.xyz on 2026-11-15.
const BTC_DETAILS = {
  code: 200,
  order_book_details: [
    {
      symbol: "BTC",
      market_id: 1,
      market_type: "perp",
      status: "active",
      min_base_amount: "0.00020",
      min_quote_amount: "10.000000",
      size_decimals: 5,
      price_decimals: 1,
      last_trade_price: 64756.8,
      mark_price: "64755.9",
    },
  ],
};
const ACCOUNT = {
  code: 200,
  total: 1,
  accounts: [
    {
      index: 281474976710389,
      collateral: "715732.592680",
      available_balance: "379750.676665",
      positions: [
        { market_id: 0, symbol: "ETH", sign: -1, position: "242.9454", avg_entry_price: "2049.33", unrealized_pnl: "59151.351990", margin_mode: 0 },
        { market_id: 3, symbol: "SOL", sign: 1, position: "0.000", avg_entry_price: "0", unrealized_pnl: "0", margin_mode: 1 },
      ],
    },
  ],
};

describe("Lighter executor logic", () => {
  const btc = parseMarket(BTC_DETAILS) as LighterMarket;

  it("reads a market's scaling, minimums and last price", () => {
    expect(btc).toEqual({ marketId: 1, symbol: "BTC", status: "active", sizeDecimals: 5, priceDecimals: 1, minBase: 0.0002, minQuote: 10, lastPrice: 64756.8 });
    expect(parseMarket({ code: 200, order_book_details: [] })).toBeNull();
    expect(parseMarket({ order_book_details: [{ ...BTC_DETAILS.order_book_details[0], last_trade_price: 0 }] })).toBeNull();
  });

  it("reads open positions with their side, and drops empty ones", () => {
    expect(parseAccount(ACCOUNT)).toEqual({
      index: 281474976710389,
      collateral: 715732.59268,
      available: 379750.676665,
      // No total_asset_value in this trimmed body: collateral plus unrealized P&L.
      totalValue: 715732.59268 + 59151.35199,
      positions: [{ marketId: 0, symbol: "ETH", size: -242.9454, avgEntryPrice: 2049.33, unrealizedPnl: 59151.35199, marginMode: 0 }],
    });
    expect(parseAccount({ accounts: [] })).toBeNull();
  });

  it("plans a $20 market buy: size rounded down, worst price rounded up", () => {
    const plan = planOrder({ marketId: 1, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }, btc);
    expect(plan).toMatchObject({ ok: true, baseAmount: 30, base: 0.0003 });
    // 64756.8 x 1.005 = 65080.584 -> 65080.6 at one price decimal.
    expect(plan.ok && plan.price).toBe(650806);
  });

  it("rounds a sell's worst price down, so the limit never gets tighter", () => {
    const plan = planOrder({ marketId: 1, side: "sell", base: 0.0004, reduceOnly: true, maxSlippageBps: 50 }, btc);
    // 64756.8 x 0.995 = 64433.016 -> 64433.0
    expect(plan).toMatchObject({ ok: true, baseAmount: 40, price: 644330 });
  });

  it("refuses orders under Lighter's minimum ($10 or the minimum size)", () => {
    expect(planOrder({ marketId: 1, side: "buy", usd: 9, reduceOnly: false, maxSlippageBps: 50 }, btc)).toEqual({ ok: false, reason: "below Lighter's minimum order (0.0002 BTC and $10)" });
    expect(planOrder({ marketId: 1, side: "buy", base: 0.0001, reduceOnly: false, maxSlippageBps: 50 }, btc).ok).toBe(false);
  });

  it("refuses an inactive market, no size, or an unsafe slippage limit", () => {
    expect(planOrder({ marketId: 1, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }, { ...btc, status: "frozen" }).ok).toBe(false);
    expect(planOrder({ marketId: 1, side: "buy", reduceOnly: false, maxSlippageBps: 50 }, btc).ok).toBe(false);
    expect(planOrder({ marketId: 1, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 900 }, btc).ok).toBe(false);
    expect(planOrder({ marketId: 1, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 0 }, btc).ok).toBe(false);
  });

  it("checks fills from the position before and after", () => {
    expect(checkFill(0, 0.0003, "buy", 0.0003, 5)).toEqual({ status: "filled", filledBase: 0.0003 });
    expect(checkFill(0, 0.0001, "buy", 0.0003, 5)).toMatchObject({ status: "partial" });
    expect(checkFill(0, 0, "buy", 0.0003, 5)).toEqual({ status: "none", filledBase: 0 });
    // Opening a short is a sell: the signed size goes down.
    expect(checkFill(0, -0.5, "sell", 0.5, 4)).toMatchObject({ status: "filled" });
    // Covering a short is a buy.
    expect(checkFill(-0.5, 0, "buy", 0.5, 4)).toMatchObject({ status: "filled" });
  });

  it("makes client order indexes and leverage fractions Lighter accepts", () => {
    expect(clientOrderIndex(1_794_722_181_770)).toBe(1_794_722_181_770);
    expect(clientOrderIndex(2 ** 48 + 5)).toBe(5);
    expect(marginFractionFor(1)).toBe(10000);
    expect(marginFractionFor(3)).toBe(3333);
  });
});

describe("Lighter and the engine's state", () => {
  const TOKENS = new Map([[3, "sol-perp"], [1, "btc-perp"]]);
  const account = (positions: { market_id: number; sign: number; position: string; avg_entry_price: string }[], total = "100") =>
    parseAccount({ accounts: [{ index: 9, collateral: "100", available_balance: "50", total_asset_value: total, positions: positions.map((p) => ({ ...p, symbol: "X", unrealized_pnl: "0", margin_mode: 1 })) }] })!;

  it("maps engine sides to Lighter orders", () => {
    expect(lighterOrderFor("buy")).toEqual({ side: "buy", reduceOnly: false });
    expect(lighterOrderFor("sell")).toEqual({ side: "sell", reduceOnly: true });
    expect(lighterOrderFor("short")).toEqual({ side: "sell", reduceOnly: false });
    expect(lighterOrderFor("cover")).toEqual({ side: "buy", reduceOnly: true });
  });

  it("uses Lighter's account value as equity: cash makes up the difference to the positions' engine value", () => {
    const long = engineStateFromLighter(account([{ market_id: 3, sign: 1, position: "0.2", avg_entry_price: "70" }], "100"), TOKENS, { "sol-perp": 75 }, [], "2026-11-15T10:00:00Z");
    expect(long.positions).toEqual([{ token_address: "sol-perp", quantity: 0.2, avg_entry_price: 70, opened_at: "2026-11-15T10:00:00Z", side: "long", stop_price: null }]);
    expect(long.cash).toBeCloseTo(100 - 0.2 * 75, 9);
    // A short is worth quantity x (2 x entry - price) in the engine.
    const short = engineStateFromLighter(account([{ market_id: 3, sign: -1, position: "0.2", avg_entry_price: "70" }], "101"), TOKENS, { "sol-perp": 65 }, [], "2026-11-15T10:00:00Z");
    expect(short.positions[0]).toMatchObject({ side: "short", stop_price: 70 });
    expect(short.cash).toBeCloseTo(101 - 0.2 * (140 - 65), 9);
  });

  it("keeps the opened time and a short's first-entry stop from the previous rows", () => {
    const previous = [{ token_address: "sol-perp", quantity: 0.1, avg_entry_price: 72, opened_at: "2026-11-10T00:00:00Z", side: "short" as const, stop_price: 72 }];
    const state = engineStateFromLighter(account([{ market_id: 3, sign: -1, position: "0.25", avg_entry_price: "68" }]), TOKENS, { "sol-perp": 66 }, previous, "2026-11-15T10:00:00Z");
    expect(state.positions[0]).toMatchObject({ opened_at: "2026-11-10T00:00:00Z", stop_price: 72, avg_entry_price: 68 });
  });

  it("reports positions in markets Zolva does not know", () => {
    expect(engineStateFromLighter(account([{ market_id: 99, sign: 1, position: "1", avg_entry_price: "1" }]), TOKENS, {}, [], "x").unknownMarkets).toEqual([99]);
  });

  it("finds mismatches between Zolva and Lighter, with a small tolerance", () => {
    const zolva = [{ token_address: "sol-perp", quantity: 0.2, avg_entry_price: 70, opened_at: null, side: "long" as const, stop_price: null }];
    expect(reconcile(zolva, account([{ market_id: 3, sign: 1, position: "0.201", avg_entry_price: "70" }]), TOKENS)).toEqual([]);
    expect(reconcile(zolva, account([{ market_id: 3, sign: -1, position: "0.2", avg_entry_price: "70" }]), TOKENS)).toEqual([{ token: "sol-perp", zolva: 0.2, lighter: -0.2 }]);
    expect(reconcile(zolva, account([]), TOKENS)).toEqual([{ token: "sol-perp", zolva: 0.2, lighter: 0 }]);
    expect(reconcile([], account([{ market_id: 1, sign: 1, position: "0.001", avg_entry_price: "64000" }]), TOKENS)).toEqual([{ token: "btc-perp", zolva: 0, lighter: 0.001 }]);
  });
});

describe("live Lab portfolio on Lighter", () => {
  const tokenOfMarket = new Map([[1, "BTC"], [0, "ETH"]]);
  const account = {
    index: 5,
    collateral: 1000,
    available: 600,
    totalValue: 1012,
    positions: [
      { marketId: 1, symbol: "BTC", size: 0.002, avgEntryPrice: 100_000, unrealizedPnl: 10, marginMode: 1 },
      { marketId: 0, symbol: "ETH", size: -0.1, avgEntryPrice: 3000, unrealizedPnl: 2, marginMode: 1 },
    ],
  };
  const prices = { BTC: 105_000, ETH: 2980 };

  it("derives each margin from Lighter (size x entry / leverage) and keeps the engine's stop", () => {
    const previous = [{ token_address: "BTC", quantity: 0.002, avg_entry_price: 98_000, opened_at: "2026-11-25T00:00:00Z", side: "long" as const, stop_price: 97_000 }];
    const state = engineStateFromLighter(account, tokenOfMarket, prices, previous, "2026-11-25T10:00:00Z", 2);
    const btc = state.positions.find((row) => row.token_address === "BTC")!;
    const eth = state.positions.find((row) => row.token_address === "ETH")!;
    expect(btc).toMatchObject({ margin: 100, stop_price: 97_000, opened_at: "2026-11-25T00:00:00Z" });
    expect(eth).toMatchObject({ side: "short", margin: 150, stop_price: 3000 });
    // Cash makes the engine's equity equal Lighter's account value.
    const engine = {
      cash: state.cash,
      positions: Object.fromEntries(
        state.positions.map((row) => [row.token_address, { quantity: row.quantity, entryPrice: row.avg_entry_price, margin: row.margin!, ...(row.side === "short" ? { side: "short" as const } : {}) }]),
      ),
    };
    expect(equityAt(engine, prices)).toBeCloseTo(1012, 9);
  });

  it("leaves 1x agents as before (no margin)", () => {
    const state = engineStateFromLighter(account, tokenOfMarket, prices, [], "2026-11-25T10:00:00Z");
    expect(state.positions.every((row) => row.margin === undefined)).toBe(true);
  });

  it("cuts a growing order to the per-market limit and the account leverage limit", () => {
    // Equity 1,000 at 2x over 6 markets: one market may hold (1000 x 2 / 6) x 1.1 = $366.67.
    const free = limitPortfolioOrder({ currentSize: 0, change: 0.003, price: 100_000, equity: 1000, leverage: 2, markets: 6, otherExposure: 0 });
    expect(free.allowedBase * 100_000).toBeCloseTo(300, 6);
    expect(free.reason).toBeNull();
    const big = limitPortfolioOrder({ currentSize: 0.002, change: 0.003, price: 100_000, equity: 1000, leverage: 2, markets: 6, otherExposure: 0 });
    expect((0.002 + big.allowedBase) * 100_000).toBeCloseTo(366.67, 1);
    expect(big.reason).toMatch(/per-market/);
    // The account already holds $1,900 elsewhere: only $100 of the $2,000 cap is left.
    const full = limitPortfolioOrder({ currentSize: 0, change: 0.003, price: 100_000, equity: 1000, leverage: 2, markets: 6, otherExposure: 1900 });
    expect(full.allowedBase * 100_000).toBeCloseTo(100, 6);
    expect(full.reason).toMatch(/account leverage/);
    // Asking for more than 2x is still held to 2x.
    expect(limitPortfolioOrder({ currentSize: 0, change: 1, price: 100_000, equity: 1000, leverage: 5, markets: 1, otherExposure: 0 }).allowedBase * 100_000).toBeCloseTo(2000, 6);
  });

  it("never limits an order that reduces risk", () => {
    expect(limitPortfolioOrder({ currentSize: 0.01, change: -0.004, price: 100_000, equity: 100, leverage: 2, markets: 6, otherExposure: 5000 })).toEqual({ allowedBase: 0.004, reason: null });
    expect(limitPortfolioOrder({ currentSize: -0.5, change: 0.5, price: 3000, equity: 100, leverage: 2, markets: 6, otherExposure: 5000 })).toEqual({ allowedBase: 0.5, reason: null });
  });

  it("pauses at a 25% drop from the peak", () => {
    expect(drawdownPause(1000, 760).pause).toBe(false);
    expect(drawdownPause(1000, 750)).toEqual({ pause: true, drawdown: 0.25 });
    expect(drawdownPause(900, 1000).pause).toBe(false);
  });
});
