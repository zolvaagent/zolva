/**
 * Research only: can scalping ETH or BTC on Robinhood Chain beat its costs? Replays simple
 * minute rules on the prices from scripts/research-scalp-data.mts, one position at a time,
 * long and short, at the real cost of a swap:
 *
 *   cost per side = pool fee + slippage + gas ($0.005) / trade size
 *   ETH pool fee 0.01%, BTC pool fee 0.05% (read on chain 2026-11-06)
 *
 * Rules (each with a few settings; the first half of the data picks, the second half checks):
 *   reversion:  z of the price against its last N minutes; long below -Z, short above +Z,
 *               out when z is back to 0, at the stop, or after the max hold.
 *   breakout:   long above the high of the last N minutes, short below the low; out at
 *               the stop, the target, or after the max hold.
 *
 *   IN=<scalp-minutes.json> TRADE_USD=100 SLIPPAGE=0.0001 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-scalp.mts
 */
import { readFileSync } from "node:fs";

const IN = process.env.IN ?? "scalp-minutes.json";
const TRADE_USD = Number(process.env.TRADE_USD ?? 100);
const SLIPPAGE = Number(process.env.SLIPPAGE ?? 0.0001);
const GAS_USD = 0.005;
const POOL_FEE: Record<string, number> = { ETH: 0.0001, BTC: 0.0005 };
/** LONG_ONLY=1 drops shorts (live agents cannot short yet). */
const LONG_ONLY = process.env.LONG_ONLY === "1";

type Rule = { kind: "reversion" | "breakout"; lookback: number; threshold: number; stop: number; target: number; maxHold: number };
type Trade = { side: 1 | -1; pnl: number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function run(prices: number[], rule: Rule, costPerSide: number) {
  const trades: Trade[] = [];
  let open: { side: 1 | -1; entry: number; at: number } | null = null;
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (let i = rule.lookback; i < prices.length; i++) {
    const price = prices[i];
    const window = prices.slice(i - rule.lookback, i);
    const average = mean(window);
    const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
    const z = deviation > 0 ? (price - average) / deviation : 0;

    if (open) {
      const move = (open.side * (price - open.entry)) / open.entry;
      const done =
        move <= -rule.stop ||
        move >= rule.target ||
        i - open.at >= rule.maxHold ||
        (rule.kind === "reversion" && (open.side === 1 ? z >= 0 : z <= 0));
      if (done) {
        const pnl = move - 2 * costPerSide;
        trades.push({ side: open.side, pnl });
        equity *= 1 + pnl;
        peak = Math.max(peak, equity);
        worst = Math.max(worst, 1 - equity / peak);
        open = null;
      }
      continue;
    }

    let side: 1 | -1 | 0 = 0;
    if (rule.kind === "reversion") side = z < -rule.threshold ? 1 : z > rule.threshold ? -1 : 0;
    else side = price > Math.max(...window) * (1 + rule.threshold / 1000) ? 1 : price < Math.min(...window) * (1 - rule.threshold / 1000) ? -1 : 0;
    if (side === -1 && LONG_ONLY) side = 0;
    if (side) open = { side, entry: price, at: i };
  }
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  return { returnPct: (equity - 1) * 100, trades: trades.length, winPct: trades.length ? (wins / trades.length) * 100 : 0, avgBps: trades.length ? mean(trades.map((trade) => trade.pnl)) * 10_000 : 0, worstPct: worst * 100 };
}

function rules(): Rule[] {
  const list: Rule[] = [];
  for (const lookback of [15, 30, 60])
    for (const threshold of [2, 2.5, 3])
      for (const [stop, target, maxHold] of [
        [0.003, 0.01, 30],
        [0.005, 0.01, 60],
        [0.01, 0.02, 120],
      ])
        list.push({ kind: "reversion", lookback, threshold, stop, target, maxHold });
  for (const lookback of [15, 30, 60])
    for (const threshold of [0, 1, 2])
      for (const [stop, target, maxHold] of [
        [0.002, 0.004, 30],
        [0.003, 0.006, 60],
        [0.005, 0.01, 120],
      ])
        list.push({ kind: "breakout", lookback, threshold, stop, target, maxHold });
  return list;
}

const label = (rule: Rule) => `${rule.kind} ${rule.lookback}m ${rule.kind === "reversion" ? `z${rule.threshold}` : `+${rule.threshold}‰`} stop ${rule.stop * 100}% tp ${rule.target * 100}% hold ${rule.maxHold}m`;
const fmt = (r: ReturnType<typeof run>) => `${r.returnPct.toFixed(2).padStart(7)}%  trades ${String(r.trades).padStart(4)}  win ${r.winPct.toFixed(0).padStart(3)}%  avg ${r.avgBps.toFixed(1).padStart(6)} bps  worst ${r.worstPct.toFixed(1)}%`;

const data = JSON.parse(readFileSync(IN, "utf8")) as Record<string, [number, number][]>;
console.log(`trade size $${TRADE_USD}, slippage ${(SLIPPAGE * 100).toFixed(3)}%, gas $${GAS_USD} a swap${LONG_ONLY ? ", long only" : ", long and short"}`);
for (const [symbol, rows] of Object.entries(data)) {
  const prices = rows.map(([, price]) => price);
  const costPerSide = POOL_FEE[symbol] + SLIPPAGE + GAS_USD / TRADE_USD;
  const half = Math.floor(prices.length / 2);
  const first = prices.slice(0, half);
  const second = prices.slice(half);
  const hold = (prices.at(-1)! / prices[0] - 1) * 100;
  console.log(`\n== ${symbol}: ${(prices.length / 1440).toFixed(1)} days, holding ${hold.toFixed(1)}%, cost ${(costPerSide * 2 * 10_000).toFixed(1)} bps a round trip`);
  const scored = rules().map((rule) => ({ rule, pick: run(first, rule, costPerSide) })).sort((a, b) => b.pick.returnPct - a.pick.returnPct);
  console.log("   best 5 on the first half, then checked on the second half:");
  for (const { rule, pick } of scored.slice(0, 5)) {
    console.log(`   ${label(rule)}`);
    console.log(`      first  ${fmt(pick)}`);
    console.log(`      second ${fmt(run(second, rule, costPerSide))}`);
  }
  const positiveSecond = scored.filter(({ rule }) => run(second, rule, costPerSide).returnPct > 0).length;
  console.log(`   rules positive on the second half: ${positiveSecond} of ${scored.length}`);
}
