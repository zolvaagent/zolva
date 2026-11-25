import { longValue, shortValue } from "../engine/engine.ts";

/**
 * The order ledger on an agent page: every order the agent placed, the cash it moved, and running
 * totals, built only from what Zolva recorded (trades, the cash after each hour, positions).
 *
 * Accounting, per market:
 * - Opening or adding (buy, short) moves cash out; that cash is the position's basis.
 * - A partial reduce (a resize sell or cover) realises its share of the basis.
 * - A full exit (any other sell or cover) realises whatever is left of the basis.
 * - An open position's unrealised P&L is its value now minus the basis still in it.
 * So realised and unrealised P&L are after costs (and after funding on perps), and
 *   start capital + realised + unrealised = cash + open positions = value now
 * holds exactly when the ledger's cash equals the recorded cash, which is the check shown.
 *
 * Cash per order: buy and an unleveraged short pay quantity x price + cost (a leveraged short
 * puts in quantity x price / leverage); a sell returns quantity x price - cost. A cover returns
 * what the short was worth, which depends on funding and resizes, so a cover's cash comes from the
 * recorded cash change of its hour (minus the other orders of that hour). Live swaps move cash by
 * the USDG swapped plus or minus gas (see LedgerTrade.gasUsd).
 */

export type LedgerSide = "buy" | "sell" | "short" | "cover";

export type LedgerTrade = {
  ts: number;
  token: string;
  symbol: string;
  side: LedgerSide;
  quantity: number;
  price: number;
  costUsd: number;
  reason: string;
  /** Live agents: the swap on Robinhood Chain. */
  txHash: string | null;
  /**
   * Live agents: the gas of the swap. Cash then moves by the swap's USDG plus or minus gas
   * (apply_live_fill, never below zero), while costUsd is gas plus slippage against the decision
   * price, which the fill price already holds.
   */
  gasUsd?: number | null;
};

export type LedgerPosition = { token: string; quantity: number; entryPrice: number; side: "long" | "short"; margin: number | null };

/** Perps: one hour's close and funding rate (signed, positive: longs pay shorts). */
export type FundingHour = { ts: number; close: number; rate: number };

export type LedgerInput = {
  startCapital: number;
  /** Every trade the agent made, in the order they were recorded. */
  trades: LedgerTrade[];
  /** Cash after each hour the agent ran (agent_runs.cash), oldest first. */
  runs: { ts: number; cash: number }[];
  /** The agent's cash now (agents.cash). */
  cash: number;
  positions: LedgerPosition[];
  /** Latest price per token (open positions are valued at it). */
  prices: Record<string, number>;
  /** Perps only, per token: hourly closes and funding, oldest first. */
  funding?: Record<string, FundingHour[]>;
  /** Leverage of a short (bounce short on perps); 1 otherwise. */
  leverage?: number;
  /**
   * Lab portfolio agents (AgentParams.portfolio): every position is margined, so no order's cash
   * follows from its own fields. Each hour's recorded cash change is shared by that hour's orders,
   * and funding moves the margin, not the quantity.
   */
  portfolio?: boolean;
};

export type LedgerRow = LedgerTrade & {
  /** Cash in (positive) or out (negative), costs included. */
  cashFlow: number;
  cashAfter: number;
  /** Set on orders that reduce or close a position: P&L after costs (and funding). */
  realisedPnl: number | null;
  /** Quantity still held in this market after the order (ledger view). */
  heldAfter: number;
};

export type LedgerTotals = {
  startCapital: number;
  realisedPnl: number;
  unrealisedPnl: number;
  /** Costs paid on every order; already inside the P&L above. */
  costs: number;
  /** Perps: net funding paid (negative) or received; already inside the P&L above. null on spot. */
  funding: number | null;
  /** Recorded cash plus open positions at the latest prices. */
  valueNow: number;
  ledgerCash: number;
  recordedCash: number;
  /** The ledger's cash equals the recorded cash, so start + realised + unrealised = value now. */
  balances: boolean;
  /** Markets where the ledger's quantity and the recorded position differ (spot only; funding moves perps). */
  quantityMismatches: string[];
};

export type Ledger = { rows: LedgerRow[]; totals: LedgerTotals };

type Book = { quantity: number; basis: number; side: "long" | "short" };

const isReduce = (side: LedgerSide) => side === "sell" || side === "cover";
const centsTolerance = (start: number) => Math.max(0.01, start * 1e-6);

/** Cash an order moves when it can be computed from the order alone; null for a cover. */
function formulaFlow(trade: LedgerTrade, leverage: number): number | null {
  const gross = trade.quantity * trade.price;
  if (trade.side === "buy") return -(gross + trade.costUsd);
  if (trade.side === "sell") return gross - trade.costUsd;
  if (trade.side === "short") return leverage > 1 ? -gross / leverage : -(gross + trade.costUsd);
  return null;
}

export function buildLedger(input: LedgerInput): Ledger {
  const leverage = Math.max(1, input.leverage ?? 1);
  const perps = input.funding !== undefined;
  const trades = [...input.trades].map((trade, order) => ({ trade, order })).sort((a, b) => a.trade.ts - b.trade.ts || a.order - b.order).map(({ trade }) => trade);

  // Recorded cash before and after each hour, for covers and short resizes.
  const runs = [...input.runs].sort((a, b) => a.ts - b.ts);
  const cashAfter = new Map(runs.map((run) => [run.ts, run.cash]));
  const cashBefore = (ts: number) => {
    let before = input.startCapital;
    for (const run of runs) {
      if (run.ts >= ts) break;
      before = run.cash;
    }
    return before;
  };

  // Cash per order. A short or cover in the same hour as a short resize shares one cash change,
  // so the hour's recorded change, minus the orders that can be computed, goes to those orders.
  const flows = new Map<LedgerTrade, number>();
  const byHour = new Map<number, LedgerTrade[]>();
  for (const trade of trades) byHour.set(trade.ts, [...(byHour.get(trade.ts) ?? []), trade]);
  for (const [ts, hour] of byHour) {
    const needsRecord = input.portfolio ? hour : hour.filter((trade) => trade.side === "cover" || (trade.side === "short" && trade.reason === "resize"));
    let known = 0;
    for (const trade of hour) {
      if (needsRecord.includes(trade)) continue;
      const flow = formulaFlow(trade, leverage)!;
      flows.set(trade, flow);
      known += flow;
    }
    if (!needsRecord.length) continue;
    const after = cashAfter.get(ts);
    const rest = after === undefined ? null : after - cashBefore(ts) - known;
    for (const trade of needsRecord) {
      // Without a recorded hour (should not happen), a cover is valued as an unleveraged short at its price.
      flows.set(trade, rest !== null ? rest / needsRecord.length : trade.quantity * trade.price - trade.costUsd);
    }
  }

  const books = new Map<string, Book>();
  const rows: LedgerRow[] = [];
  let cash = input.startCapital;
  let realised = 0;
  let funding = perps ? 0 : null;

  // Perps funding, hour by hour, on what the ledger holds at the start of that hour (as the engine
  // does: a long's quantity shrinks by the payment; a short is paid).
  const fundingHours = perps
    ? [...new Set(Object.values(input.funding!).flatMap((hours) => hours.map((hour) => hour.ts)))].sort((a, b) => a - b)
    : [];
  const fundingAt = perps ? Object.fromEntries(Object.entries(input.funding!).map(([token, hours]) => [token, new Map(hours.map((hour) => [hour.ts, hour]))])) : {};
  let fundingIndex = 0;
  const payFundingUntil = (ts: number) => {
    // Hours up to and including ts pay on the positions held before that hour's orders.
    while (fundingIndex < fundingHours.length && fundingHours[fundingIndex] <= ts) {
      const hourTs = fundingHours[fundingIndex++];
      for (const [token, book] of books) {
        const hour = fundingAt[token]?.get(hourTs);
        if (!hour || !hour.rate || book.quantity <= 0) continue;
        const payment = book.quantity * hour.close * hour.rate;
        if (book.side === "long") {
          funding! -= payment;
          // A margined long (portfolio) pays from its margin; its size stays.
          if (!input.portfolio) book.quantity *= 1 - hour.rate;
        } else funding! += payment;
      }
    }
  };

  for (const trade of trades) {
    if (perps) payFundingUntil(trade.ts);
    const gas = trade.gasUsd ?? null;
    const gross = trade.quantity * trade.price;
    const flow = gas === null ? flows.get(trade)! : trade.side === "buy" ? -Math.min(cash, gross + gas) : gross - gas;
    cash += flow;
    const book = books.get(trade.token) ?? { quantity: 0, basis: 0, side: trade.side === "short" || trade.side === "cover" ? "short" : "long" };
    let realisedPnl: number | null = null;
    if (!isReduce(trade.side)) {
      book.quantity += trade.quantity;
      book.basis -= flow;
    } else if (trade.reason === "resize" && trade.quantity < book.quantity * (1 - 1e-9)) {
      const share = book.basis * (trade.quantity / book.quantity);
      realisedPnl = flow - share;
      book.basis -= share;
      book.quantity -= trade.quantity;
    } else {
      realisedPnl = flow - book.basis;
      book.quantity = 0;
      book.basis = 0;
    }
    if (realisedPnl !== null) realised += realisedPnl;
    if (book.quantity > 0) books.set(trade.token, book);
    else books.delete(trade.token);
    rows.push({ ...trade, cashFlow: flow, cashAfter: cash, realisedPnl, heldAfter: book.quantity });
  }
  if (perps) payFundingUntil(Infinity);

  let unrealised = 0;
  let openValue = 0;
  const quantityMismatches: string[] = [];
  for (const position of input.positions) {
    const price = input.prices[position.token] ?? position.entryPrice;
    const value =
      position.side === "short"
        ? shortValue({ quantity: position.quantity, entryPrice: position.entryPrice, side: "short", ...(position.margin !== null ? { margin: position.margin } : {}) }, price)
        : longValue({ quantity: position.quantity, entryPrice: position.entryPrice, ...(position.margin !== null ? { margin: position.margin } : {}) }, price);
    openValue += value;
    const book = books.get(position.token);
    unrealised += value - (book?.basis ?? 0);
    if (!perps && Math.abs((book?.quantity ?? 0) - position.quantity) > position.quantity * 1e-6) quantityMismatches.push(position.token);
  }
  for (const [token, book] of books) {
    if (!input.positions.some((position) => position.token === token)) {
      // Held in the ledger but not recorded: its basis is lost money in the ledger's view.
      unrealised -= book.basis;
      if (!perps) quantityMismatches.push(token);
    }
  }

  return {
    rows,
    totals: {
      startCapital: input.startCapital,
      realisedPnl: realised,
      unrealisedPnl: unrealised,
      costs: trades.reduce((sum, trade) => sum + trade.costUsd, 0),
      funding,
      valueNow: input.cash + openValue,
      ledgerCash: cash,
      recordedCash: input.cash,
      balances: Math.abs(cash - input.cash) <= centsTolerance(input.startCapital),
      quantityMismatches,
    },
  };
}
