/**
 * Research only (read-only, public data): what does a top-ranked Hyperliquid vault actually do?
 * (2026-11-20, owner "ok go" on reading the strategy behind tradingagentstack.com's top performers.)
 *
 * Step 0 is description, not a test: pull every fill Hyperliquid still serves for the vault (the API keeps
 * the most recent 10,000), then report per coin the order sizes, maker share, the price gap between a sell and
 * the next buy (grid spacing), how long a lot is held, realised PnL and fees, and the account's exposure now.
 * Nothing is traded and no key is used.
 *
 *   VAULT=0x... node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-vault-fills.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VAULT = (process.env.VAULT ?? "0xb65dd7c56afbf3b272ab5fc49be44b47dca18003").toLowerCase();
const CACHE = join(tmpdir(), "zolva-vault-fills");
const API = "https://api.hyperliquid.xyz/info";

type Fill = {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  crossed: boolean;
  fee: string;
  tid: number;
};

async function info<T>(body: object): Promise<T> {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return (await response.json()) as T;
}

/** All fills the API still serves, oldest first (pages of up to 2,000 by time). */
async function allFills(): Promise<Fill[]> {
  const file = join(CACHE, `${VAULT}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const byTid = new Map<number, Fill>();
  let start = Date.now() - 365 * 86_400_000;
  for (let page = 0; page < 20; page++) {
    const batch = await info<Fill[]>({ type: "userFillsByTime", user: VAULT, startTime: start, endTime: Date.now() });
    if (!batch.length) break;
    for (const f of batch) byTid.set(f.tid, f);
    const last = Math.max(...batch.map((f) => f.time));
    if (batch.length < 2000 || last <= start) break;
    start = last;
    await new Promise((r) => setTimeout(r, 500));
  }
  const fills = [...byTid.values()].sort((a, b) => a.time - b.time || a.tid - b.tid);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(fills));
  return fills;
}

const median = (values: number[]) => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

async function main() {
  const fills = await allFills();
  const days = (fills.at(-1)!.time - fills[0].time) / 86_400_000;
  console.log(`Vault ${VAULT}: ${fills.length} fills over ${days.toFixed(1)} days (${new Date(fills[0].time).toISOString().slice(0, 16)} to ${new Date(fills.at(-1)!.time).toISOString().slice(0, 16)})`);
  const dirs = new Map<string, number>();
  for (const f of fills) dirs.set(f.dir, (dirs.get(f.dir) ?? 0) + 1);
  console.log("Directions:", Object.fromEntries(dirs));
  const maker = fills.filter((f) => !f.crossed).length / fills.length;
  const pnl = fills.reduce((s, f) => s + Number(f.closedPnl), 0);
  const fees = fills.reduce((s, f) => s + Number(f.fee), 0);
  const volume = fills.reduce((s, f) => s + Number(f.px) * Number(f.sz), 0);
  console.log(`Maker share ${pct(maker)}; volume $${volume.toFixed(0)}; realised PnL $${pnl.toFixed(0)}; fees $${fees.toFixed(0)} (${((fees / volume) * 1e4).toFixed(2)} bp of volume)`);

  console.log("\ncoin   fills  vol$      pnl$    fees$  med order$  med gap sell->buy  med gap buy->sell  med hold  max lots");
  const coins = [...new Set(fills.map((f) => f.coin))];
  const rows = coins.map((coin) => {
    const cf = fills.filter((f) => f.coin === coin);
    // Group fills that share a timestamp and side into one order.
    const orders: { time: number; side: string; px: number; usd: number; start: number }[] = [];
    for (const f of cf) {
      const prev = orders.at(-1);
      const usd = Number(f.px) * Number(f.sz);
      if (prev && prev.time === f.time && prev.side === f.side) {
        prev.px = (prev.px * prev.usd + Number(f.px) * usd) / (prev.usd + usd);
        prev.usd += usd;
      } else orders.push({ time: f.time, side: f.side, px: Number(f.px), usd, start: Number(f.startPosition) });
    }
    const gapsDown: number[] = [];
    const gapsUp: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const a = orders[i - 1];
      const b = orders[i];
      if (a.side === "A" && b.side === "B") gapsDown.push(b.px / a.px - 1);
      if (a.side === "B" && b.side === "A") gapsUp.push(b.px / a.px - 1);
    }
    // Lot holding time: FIFO match buy orders to sell orders by size.
    const lots: { time: number; usd: number }[] = [];
    const holds: number[] = [];
    let maxLots = 0;
    for (const o of orders) {
      if (o.side === "B") lots.push({ time: o.time, usd: o.usd });
      else {
        let left = o.usd;
        while (left > 1 && lots.length) {
          const lot = lots[0];
          const take = Math.min(lot.usd, left);
          holds.push((o.time - lot.time) / 3_600_000);
          lot.usd -= take;
          left -= take;
          if (lot.usd <= 1) lots.shift();
        }
      }
      maxLots = Math.max(maxLots, lots.length);
    }
    return {
      coin,
      fills: cf.length,
      vol: cf.reduce((s, f) => s + Number(f.px) * Number(f.sz), 0),
      pnl: cf.reduce((s, f) => s + Number(f.closedPnl), 0),
      fees: cf.reduce((s, f) => s + Number(f.fee), 0),
      order: median(orders.map((o) => o.usd)),
      down: median(gapsDown),
      up: median(gapsUp),
      hold: median(holds),
      maxLots,
    };
  });
  for (const r of rows.sort((a, b) => b.fills - a.fills)) {
    console.log(
      `${r.coin.padEnd(6)} ${String(r.fills).padStart(5)} ${r.vol.toFixed(0).padStart(8)} ${r.pnl.toFixed(0).padStart(7)} ${r.fees.toFixed(0).padStart(7)} ${r.order.toFixed(0).padStart(10)}  ${pct(r.down).padStart(17)}  ${pct(r.up).padStart(17)}  ${r.hold.toFixed(1).padStart(6)}h  ${String(r.maxLots).padStart(8)}`,
    );
  }

  const state = await info<{ marginSummary: { accountValue: string; totalNtlPos: string }; assetPositions: { position: { coin: string; positionValue: string; leverage: { value: number }; unrealizedPnl: string } }[] }>({ type: "clearinghouseState", user: VAULT });
  const value = Number(state.marginSummary.accountValue);
  console.log(`\nNow: account $${value.toFixed(0)}, open notional $${Number(state.marginSummary.totalNtlPos).toFixed(0)} (${pct(Number(state.marginSummary.totalNtlPos) / value)} of the account)`);
  for (const p of state.assetPositions) console.log(`  ${p.position.coin} $${Number(p.position.positionValue).toFixed(0)} lev ${p.position.leverage.value}x upnl $${Number(p.position.unrealizedPnl).toFixed(0)}`);
  console.log(`Realised PnL over the window as a share of today's account: ${pct((pnl - fees) / value)} in ${days.toFixed(0)} days`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
