/**
 * Research only (read-only, public data): what do the top-ranked Lighter public pools actually trade?
 * (2026-11-20, owner "Yes, Lighter pools", after the FuturAI vault study in research-vault-fills.mts.)
 *
 * Step 0 is description, not a test. For each pool: every trade the Lighter API serves (public, no key), turned
 * into the pool's own position per market; then round trips (flat -> position -> flat or flip), their side,
 * size against the pool's collateral, holding time and PnL before fees; maker share; and the market context at
 * each entry from Lighter 1h candles (24h move before entry, price vs its 7 day average).
 *
 *   POOLS=281474976543116,281474976552443 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-lighter-pools.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://mainnet.zklighter.elliot.ai/api/v1";
const POOLS = (process.env.POOLS ?? "281474976543116,281474976552443").split(",");
const CACHE = join(tmpdir(), "zolva-lighter-pools");
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 400);

type Trade = {
  trade_id: number;
  market_id: number;
  market_symbol: string;
  size: string;
  price: string;
  usd_amount: string;
  ask_account_id: number;
  bid_account_id: number;
  is_maker_ask: boolean;
  timestamp: number;
};

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(30_000) });
    if (response.ok) return (await response.json()) as T;
    if (attempt >= 4) throw new Error(`${response.status} ${path}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

async function poolTrades(pool: string): Promise<Trade[]> {
  const file = join(CACHE, `trades-${pool}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const all = new Map<number, Trade>();
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await get<{ trades: Trade[]; next_cursor?: string }>(
      `/trades?account_index=${pool}&sort_by=timestamp&limit=100${cursor ? `&cursor=${cursor}` : ""}`,
    );
    for (const t of body.trades ?? []) all.set(t.trade_id, t);
    if (!body.next_cursor || !body.trades?.length) break;
    cursor = body.next_cursor;
    if (page % 50 === 49) console.log(`  ${pool}: ${all.size} trades so far`);
    await new Promise((r) => setTimeout(r, 250));
  }
  const trades = [...all.values()].sort((a, b) => a.timestamp - b.timestamp || a.trade_id - b.trade_id);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(trades));
  return trades;
}

/** Hourly closes for a market around the trades (Lighter candles, cached). */
async function hourly(marketId: number, from: number, to: number): Promise<Map<number, number>> {
  const file = join(CACHE, `candles-${marketId}-${Math.floor(from / 86_400_000)}-${Math.floor(to / 86_400_000)}.json`);
  let rows: [number, number][];
  if (existsSync(file)) rows = JSON.parse(readFileSync(file, "utf8"));
  else {
    // /candles takes seconds and returns { c: [{ t (ms), c (close) }] }; /candlesticks answers 403.
    const start = Math.floor((from - 8 * 86_400_000) / 1000);
    const end = Math.ceil(to / 1000);
    const count = Math.ceil((end - start) / 3600) + 2;
    const body = await get<{ c?: { t: number; c: number }[] }>(
      `/candles?market_id=${marketId}&resolution=1h&start_timestamp=${start}&end_timestamp=${end}&count_back=${count}`,
    );
    rows = (body.c ?? []).map((c) => [c.t, Number(c.c)]);
    writeFileSync(file, JSON.stringify(rows));
    await new Promise((r) => setTimeout(r, 300));
  }
  return new Map(rows.map(([t, c]) => [Math.floor(t / 3_600_000), c]));
}

const median = (values: number[]) => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%` : "-");

type Trip = { market: string; marketId: number; side: "long" | "short"; open: number; close: number; entryPx: number; exitPx: number; peakUsd: number; pnl: number; fills: number };

async function studyPool(pool: string) {
  const account = await get<{ accounts: { name: string; collateral: string }[] }>(`/account?by=index&value=${pool}`);
  const { name, collateral } = account.accounts[0];
  const trades = await poolTrades(pool);
  if (!trades.length) return console.log(`\n${name}: no trades served`);
  const days = (trades.at(-1)!.timestamp - trades[0].timestamp) / 86_400_000;
  const poolId = Number(pool);
  const maker = trades.filter((t) => (t.is_maker_ask ? t.ask_account_id : t.bid_account_id) === poolId).length / trades.length;
  const volume = trades.reduce((s, t) => s + Number(t.usd_amount), 0);
  console.log(`\n=== ${name} (pool ${pool}), collateral now $${Number(collateral).toFixed(0)}`);
  console.log(`${trades.length} trades over ${days.toFixed(1)} days (${new Date(trades[0].timestamp).toISOString().slice(0, 10)} to ${new Date(trades.at(-1)!.timestamp).toISOString().slice(0, 10)}), volume $${volume.toFixed(0)}, maker share ${pct(maker)}`);

  // Rebuild the pool's position per market and cut it into round trips.
  const trips: Trip[] = [];
  const state = new Map<number, { pos: number; cost: number; trip: Trip | null }>();
  for (const t of trades) {
    const signed = (t.bid_account_id === poolId ? 1 : -1) * Number(t.size);
    const px = Number(t.price);
    const s = state.get(t.market_id) ?? { pos: 0, cost: 0, trip: null };
    let qty = signed;
    while (Math.abs(qty) > 1e-12) {
      if (s.pos === 0 || Math.sign(s.pos) === Math.sign(qty)) {
        if (s.pos === 0) s.trip = { market: t.market_symbol, marketId: t.market_id, side: qty > 0 ? "long" : "short", open: t.timestamp, close: 0, entryPx: px, exitPx: 0, peakUsd: 0, pnl: 0, fills: 0 };
        s.cost += qty * px;
        s.pos += qty;
        qty = 0;
      } else {
        const closing = Math.sign(qty) * Math.min(Math.abs(qty), Math.abs(s.pos));
        const avg = s.cost / s.pos;
        s.trip!.pnl += -closing * (px - avg);
        s.cost += closing * avg;
        s.pos += closing;
        qty -= closing;
        if (Math.abs(s.pos) < 1e-9) {
          s.trip!.close = t.timestamp;
          s.trip!.exitPx = px;
          trips.push(s.trip!);
          s.pos = 0;
          s.cost = 0;
          s.trip = null;
        }
      }
    }
    if (s.trip) {
      s.trip.fills++;
      s.trip.peakUsd = Math.max(s.trip.peakUsd, Math.abs(s.pos) * px);
    }
    state.set(t.market_id, s);
  }
  const open = [...state.values()].filter((s) => s.trip);
  const cap = Number(collateral);

  const byMarket = new Map<string, Trip[]>();
  for (const trip of trips) byMarket.set(trip.market, [...(byMarket.get(trip.market) ?? []), trip]);
  console.log("market   trips  long%  pnl$     win%   med hold  med size/collateral  max size/collateral");
  for (const [market, list] of [...byMarket].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    console.log(
      `${market.padEnd(8)} ${String(list.length).padStart(5)}  ${pct(list.filter((x) => x.side === "long").length / list.length).padStart(6)}  ${list.reduce((s, x) => s + x.pnl, 0).toFixed(0).padStart(7)}  ${pct(list.filter((x) => x.pnl > 0).length / list.length).padStart(7)}  ${(median(list.map((x) => (x.close - x.open) / 3_600_000))).toFixed(1).padStart(7)}h  ${pct(median(list.map((x) => x.peakUsd / cap))).padStart(19)}  ${pct(Math.max(...list.map((x) => x.peakUsd / cap))).padStart(19)}`,
    );
  }
  const total = trips.reduce((s, x) => s + x.pnl, 0);
  const wins = trips.filter((x) => x.pnl > 0);
  const losses = trips.filter((x) => x.pnl <= 0);
  console.log(`All: ${trips.length} closed trips (${open.length} open now), long ${pct(trips.filter((x) => x.side === "long").length / trips.length)}, PnL before fees $${total.toFixed(0)} (${pct(total / cap)} of collateral), win rate ${pct(wins.length / trips.length)}, avg win $${(wins.reduce((s, x) => s + x.pnl, 0) / Math.max(1, wins.length)).toFixed(0)}, avg loss $${(losses.reduce((s, x) => s + x.pnl, 0) / Math.max(1, losses.length)).toFixed(0)}, med hold ${median(trips.map((x) => (x.close - x.open) / 3_600_000)).toFixed(1)}h`);
  console.log(`Trip move entry->exit (in trade direction): median ${pct(median(trips.map((x) => (x.side === "long" ? 1 : -1) * (x.exitPx / x.entryPx - 1))))}; best ${pct(Math.max(...trips.map((x) => (x.side === "long" ? 1 : -1) * (x.exitPx / x.entryPx - 1))))}; worst ${pct(Math.min(...trips.map((x) => (x.side === "long" ? 1 : -1) * (x.exitPx / x.entryPx - 1))))}`);

  // Entry context from hourly candles (top markets only, to keep calls few).
  const top = [...byMarket].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  const ctx: { side: string; move24: number; vs7d: number }[] = [];
  for (const [, list] of top) {
    const closes = await hourly(list[0].marketId, list[0].open, Math.max(...list.map((x) => x.close)));
    for (const trip of list) {
      const h = Math.floor(trip.open / 3_600_000);
      const now = closes.get(h - 1);
      const before = closes.get(h - 25);
      const week: number[] = [];
      for (let k = 1; k <= 168; k++) {
        const c = closes.get(h - k);
        if (c) week.push(c);
      }
      if (now && before && week.length > 100) ctx.push({ side: trip.side, move24: now / before - 1, vs7d: now / (week.reduce((a, b) => a + b, 0) / week.length) - 1 });
    }
  }
  for (const side of ["long", "short"]) {
    const c = ctx.filter((x) => x.side === side);
    if (!c.length) continue;
    console.log(`Entries ${side} (${c.length} with candles): 24h move before entry median ${pct(median(c.map((x) => x.move24)))}, ${pct(c.filter((x) => x.move24 < 0).length / c.length)} after a 24h fall; price vs 7d average median ${pct(median(c.map((x) => x.vs7d)))}, ${pct(c.filter((x) => x.vs7d > 0).length / c.length)} above it`);
  }
}

async function main() {
  for (const pool of POOLS) await studyPool(pool.trim());
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
