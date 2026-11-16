/**
 * Lighter RH (perps on Robinhood Chain): the pure part of the real money executor. No network and no
 * signing here, so it is fully testable; workers/lighter/ does the I/O with these functions.
 *
 * Facts read from Lighter's API and the official signer source (lighter-go v1.0.12), 2026-11-15:
 * - Orders are integers: base = size x 10^size_decimals, price = price x 10^price_decimals (uint32).
 * - A market order is type 1 with time in force 0 (immediate or cancel); its price is the worst price
 *   we accept, so it doubles as the slippage limit.
 * - Every market has a minimum order: min_base_amount and min_quote_amount ($10 on RH today).
 * - tx_type: CreateOrder 14, UpdateLeverage 20. 1x leverage is initial margin fraction 10000;
 *   margin mode 1 is isolated.
 * - Positions come from GET /api/v1/account (public): `position` is unsigned, `sign` is 1 long, -1 short.
 */

export const LIGHTER_TX = { createOrder: 14, updateLeverage: 20 } as const;
export const ORDER_TYPE_MARKET = 1;
export const TIME_IN_FORCE_IOC = 0;
export const MARGIN_MODE_ISOLATED = 1;
/** Initial margin fraction for a leverage: 10000 / leverage (1x = 10000). */
export const marginFractionFor = (leverage: number) => Math.round(10000 / leverage);

export type LighterMarket = {
  marketId: number;
  symbol: string;
  status: string;
  sizeDecimals: number;
  priceDecimals: number;
  minBase: number;
  minQuote: number;
  /** Last trade price, the reference for sizing and the slippage limit. */
  lastPrice: number;
};

/** One market from GET /api/v1/orderBookDetails?market_id=…; null when the body is not a usable perp. */
export function parseMarket(body: unknown): LighterMarket | null {
  const raw = (body as { order_book_details?: Record<string, unknown>[] })?.order_book_details?.[0];
  if (!raw) return null;
  const market: LighterMarket = {
    marketId: Number(raw.market_id),
    symbol: String(raw.symbol),
    status: String(raw.status),
    sizeDecimals: Number(raw.size_decimals),
    priceDecimals: Number(raw.price_decimals),
    minBase: Number(raw.min_base_amount),
    minQuote: Number(raw.min_quote_amount),
    lastPrice: Number(raw.last_trade_price),
  };
  const numbers = [market.marketId, market.sizeDecimals, market.priceDecimals, market.minBase, market.minQuote, market.lastPrice];
  return numbers.every(Number.isFinite) && market.lastPrice > 0 ? market : null;
}

export type LighterPosition = {
  marketId: number;
  symbol: string;
  /** Signed size in base units: positive long, negative short. */
  size: number;
  avgEntryPrice: number;
  unrealizedPnl: number;
  /** 0 cross, 1 isolated. */
  marginMode: number;
};

export type LighterAccount = {
  index: number;
  collateral: number;
  available: number;
  /** Lighter's own account value: collateral plus unrealized P&L. The agent's equity. */
  totalValue: number;
  positions: LighterPosition[];
};

/** The account from GET /api/v1/account?by=index&value=…, with open positions only. */
export function parseAccount(body: unknown): LighterAccount | null {
  const raw = (body as { accounts?: Record<string, unknown>[] })?.accounts?.[0];
  if (!raw) return null;
  const positions = ((raw.positions as Record<string, unknown>[] | undefined) ?? [])
    .map((p) => ({
      marketId: Number(p.market_id),
      symbol: String(p.symbol),
      size: Number(p.position) * (Number(p.sign) < 0 ? -1 : 1),
      avgEntryPrice: Number(p.avg_entry_price),
      unrealizedPnl: Number(p.unrealized_pnl),
      marginMode: Number(p.margin_mode),
    }))
    .filter((p) => Number.isFinite(p.size) && p.size !== 0);
  const collateral = Number(raw.collateral);
  const reported = Number(raw.total_asset_value);
  const totalValue = Number.isFinite(reported) ? reported : collateral + positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  return { index: Number(raw.index ?? raw.account_index), collateral, available: Number(raw.available_balance), totalValue, positions };
}

export type OrderRequest = {
  marketId: number;
  side: "buy" | "sell";
  /** Size in dollars (converted at the reference price) or in base units; base wins when both are set. */
  usd?: number;
  base?: number;
  /** Only shrink or close a position, never open or flip one (exits, covers and downsizing resizes). */
  reduceOnly: boolean;
  /** Worst price allowed, in basis points from the reference price. */
  maxSlippageBps: number;
};

export type OrderPlan =
  | { ok: true; baseAmount: number; price: number; base: number; worstPrice: number; notionalUsd: number }
  | { ok: false; reason: string };

/**
 * The integers to sign for a market order. Sizes round down (never more than asked), the worst price
 * rounds away from the market (buy up, sell down) so it never tightens the limit.
 */
export function planOrder(request: OrderRequest, market: LighterMarket, referencePrice = market.lastPrice): OrderPlan {
  if (market.status !== "active") return { ok: false, reason: `${market.symbol} is ${market.status} on Lighter` };
  if (!(referencePrice > 0)) return { ok: false, reason: "no reference price" };
  if (!(request.maxSlippageBps > 0 && request.maxSlippageBps <= 500)) return { ok: false, reason: "slippage limit must be between 0 and 5%" };
  const wanted = request.base ?? (request.usd !== undefined ? request.usd / referencePrice : NaN);
  if (!(wanted > 0)) return { ok: false, reason: "order size must be above zero" };

  const sizeScale = 10 ** market.sizeDecimals;
  const baseAmount = Math.floor(wanted * sizeScale + 1e-9);
  const base = baseAmount / sizeScale;
  const notionalUsd = base * referencePrice;
  if (base < market.minBase || notionalUsd < market.minQuote) {
    return { ok: false, reason: `below Lighter's minimum order (${market.minBase} ${market.symbol} and $${market.minQuote})` };
  }

  const priceScale = 10 ** market.priceDecimals;
  const slip = request.maxSlippageBps / 10000;
  const worstPrice = request.side === "buy" ? referencePrice * (1 + slip) : referencePrice * (1 - slip);
  const price = request.side === "buy" ? Math.ceil(worstPrice * priceScale - 1e-9) : Math.floor(worstPrice * priceScale + 1e-9);
  if (price <= 0 || price > 0xffffffff) return { ok: false, reason: "price does not fit Lighter's price field" };
  return { ok: true, baseAmount, price, base, worstPrice: price / priceScale, notionalUsd };
}

export type FillCheck = { status: "filled" | "partial" | "none"; filledBase: number };

/**
 * Compares the position before and after an order. Lighter's sendTx only says the tx was accepted;
 * the account is the truth. A buy should raise the signed size, a sell should lower it.
 */
export function checkFill(before: number, after: number, side: "buy" | "sell", plannedBase: number, sizeDecimals: number): FillCheck {
  const moved = side === "buy" ? after - before : before - after;
  const tolerance = 0.5 / 10 ** sizeDecimals;
  if (moved <= tolerance) return { status: "none", filledBase: 0 };
  return { status: moved >= plannedBase - tolerance ? "filled" : "partial", filledBase: moved };
}

/** Lighter's client order index: unique per account across markets, at most 2^48 - 1. Milliseconds fit for millennia. */
export function clientOrderIndex(nowMs: number): number {
  return Math.floor(nowMs) % 2 ** 48;
}

/** How an engine fill becomes a Lighter order: shorts are sells that open, covers are buys that only reduce. */
export function lighterOrderFor(side: "buy" | "sell" | "short" | "cover"): { side: "buy" | "sell"; reduceOnly: boolean } {
  if (side === "buy") return { side: "buy", reduceOnly: false };
  if (side === "short") return { side: "sell", reduceOnly: false };
  if (side === "cover") return { side: "buy", reduceOnly: true };
  return { side: "sell", reduceOnly: true };
}

export type EnginePositionRow = {
  token_address: string;
  quantity: number;
  avg_entry_price: number;
  opened_at: string | null;
  side: "long" | "short";
  stop_price: number | null;
};

/**
 * A Lighter account as the engine's state: positions (long, or short with its entry) and cash chosen so
 * that cash plus the positions' engine value equals Lighter's account value. The engine values a long at
 * quantity x price and a 1x short at quantity x (2 x entry - price), so cash absorbs funding, fees and
 * anything else Lighter booked. Opened times and short stop prices are kept from the previous rows.
 */
export function engineStateFromLighter(
  account: LighterAccount,
  tokenOfMarket: ReadonlyMap<number, string>,
  prices: Readonly<Record<string, number>>,
  previous: readonly EnginePositionRow[],
  nowIso: string,
): { cash: number; positions: EnginePositionRow[]; unknownMarkets: number[] } {
  const positions: EnginePositionRow[] = [];
  const unknownMarkets: number[] = [];
  let held = 0;
  for (const position of account.positions) {
    const token = tokenOfMarket.get(position.marketId);
    if (!token) {
      unknownMarkets.push(position.marketId);
      continue;
    }
    const side = position.size < 0 ? "short" : "long";
    const quantity = Math.abs(position.size);
    const before = previous.find((row) => row.token_address === token && row.side === side);
    const price = prices[token] ?? position.avgEntryPrice;
    held += side === "long" ? quantity * price : quantity * (2 * position.avgEntryPrice - price);
    positions.push({
      token_address: token,
      quantity,
      avg_entry_price: position.avgEntryPrice,
      opened_at: before?.opened_at ?? nowIso,
      side,
      stop_price: side === "short" ? (before?.stop_price ?? position.avgEntryPrice) : null,
    });
  }
  return { cash: account.totalValue - held, positions, unknownMarkets };
}

export type Mismatch = { token: string; zolva: number; lighter: number };

/**
 * Positions that differ between Zolva and Lighter by more than `tolerance` (a share of the larger size),
 * as signed sizes. Any mismatch outside a pending order pauses the agent: real money never runs on a
 * state Zolva does not understand.
 */
export function reconcile(
  zolva: readonly EnginePositionRow[],
  account: LighterAccount,
  tokenOfMarket: ReadonlyMap<number, string>,
  tolerance = 0.01,
): Mismatch[] {
  const signed = new Map<string, { zolva: number; lighter: number }>();
  for (const row of zolva) signed.set(row.token_address, { zolva: (row.side === "short" ? -1 : 1) * Number(row.quantity), lighter: 0 });
  for (const position of account.positions) {
    const token = tokenOfMarket.get(position.marketId) ?? `market:${position.marketId}`;
    signed.set(token, { zolva: signed.get(token)?.zolva ?? 0, lighter: position.size });
  }
  const mismatches: Mismatch[] = [];
  for (const [token, { zolva: ours, lighter }] of signed) {
    const scale = Math.max(Math.abs(ours), Math.abs(lighter));
    if (scale > 0 && Math.abs(ours - lighter) > tolerance * scale) mismatches.push({ token, zolva: ours, lighter });
  }
  return mismatches;
}
