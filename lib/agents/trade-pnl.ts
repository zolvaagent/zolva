/**
 * P&L per trade, for the Activity feed: a sell or cover shows the profit it locked in (realised), a buy
 * or short whose position is still open shows its paper profit at the latest price (unrealised).
 * Both are after costs. Built from the agent's own trades only, so on perps it leaves out funding, and a
 * cover is valued as a 1x short; the agent page's order ledger (lib/agents/ledger.ts) is the exact
 * account. Pure, so it is unit tested.
 */

export type PnlTrade = {
  ts: number;
  agentId: string;
  token: string;
  side: "buy" | "sell" | "short" | "cover";
  quantity: number;
  price: number;
  costUsd: number;
  reason: string;
};

export type TradePnl = { kind: "realised" | "unrealised"; usd: number; pct: number };

/** Key of one trade: an agent trades a token at most once per side in an hour. */
export const tradeKey = (trade: Pick<PnlTrade, "agentId" | "ts" | "token" | "side">) => `${trade.agentId}|${trade.ts}|${trade.token}|${trade.side}`;

/** One opening trade; `quantity` shrinks with partial resizes, `bought` stays (for its share of the cost). */
type Lot = { key: string; side: "long" | "short"; quantity: number; bought: number; price: number; costUsd: number };
type Book = { side: "long" | "short"; quantity: number; basis: number; entryValue: number; lots: Lot[] };

/**
 * @param history every trade of the agents involved, oldest first (only the ones shown need a result)
 * @param prices  latest price per token, for open positions
 */
export function tradePnls(history: PnlTrade[], prices: Record<string, number>): Map<string, TradePnl> {
  const out = new Map<string, TradePnl>();
  const books = new Map<string, Book>();
  for (const trade of history) {
    const bookKey = `${trade.agentId}|${trade.token}`;
    const gross = trade.quantity * trade.price;
    if (trade.side === "buy" || trade.side === "short") {
      const side = trade.side === "buy" ? "long" : "short";
      const book = books.get(bookKey) ?? { side, quantity: 0, basis: 0, entryValue: 0, lots: [] };
      book.quantity += trade.quantity;
      book.basis += gross + trade.costUsd;
      book.entryValue += gross;
      book.lots.push({ key: tradeKey(trade), side, quantity: trade.quantity, bought: trade.quantity, price: trade.price, costUsd: trade.costUsd });
      books.set(bookKey, book);
      continue;
    }
    const book = books.get(bookKey);
    if (!book || book.quantity <= 0) continue;
    // A resize closes part of the position; every other sell or cover closes all of it.
    const share = trade.reason === "resize" ? Math.min(1, trade.quantity / book.quantity) : 1;
    const basis = book.basis * share;
    const proceeds =
      book.side === "long"
        ? gross - trade.costUsd
        : // A 1x short is worth what it locked plus its gain: quantity x (2 x entry - price).
          trade.quantity * (2 * (book.entryValue / book.quantity) - trade.price) - trade.costUsd;
    const usd = proceeds - basis;
    out.set(tradeKey(trade), { kind: "realised", usd, pct: basis > 0 ? (usd / basis) * 100 : 0 });
    if (share >= 1) books.delete(bookKey);
    else {
      book.quantity -= trade.quantity;
      book.basis -= basis;
      book.entryValue -= book.entryValue * share;
      for (const lot of book.lots) lot.quantity *= 1 - share;
    }
  }
  // Still open: each opening trade's paper result at the latest price.
  for (const [bookKey, book] of books) {
    const price = prices[bookKey.slice(bookKey.indexOf("|") + 1)];
    if (!price) continue;
    for (const lot of book.lots) {
      const cost = lot.costUsd * (lot.quantity / lot.bought);
      const paid = lot.quantity * lot.price + cost;
      const usd = lot.side === "long" ? lot.quantity * price - paid : lot.quantity * (lot.price - price) - cost;
      out.set(lot.key, { kind: "unrealised", usd, pct: paid > 0 ? (usd / paid) * 100 : 0 });
    }
  }
  return out;
}
