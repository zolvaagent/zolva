/**
 * Research only (read-only): backtest of the trench "Curve Rider" (almost_bonded) entries with exit v1 and exit v2
 * on every PONS curve token launched in the last 14 days, dead ones included (2026-11-18). Owner, via the Rushr
 * session: "sebenarnya saya ingin langsung uji saja, tidak perlu dry run. Tapi kalau uji backtest, bisa tidak?",
 * then "ya, kirim ke Research". If it passes the gate below the owner wants to go live small ($100); if not, no-go.
 *
 * Everything below was committed before the first run.
 *
 * Data (free, read only, chain RPC from .dev.vars ROBINHOOD_RPC_URL):
 *   - PONS factory 0x7ed5…ec7e launch logs (topic 0x8d4aad49…): token, curve, graduation threshold (4.2 ETH).
 *   - Curve trade logs. Buy 0xec36bf57…: words [ethIn, tokensOut, fee, tax]; Sell 0x8113d738…: [tokensIn, ethOut,
 *     fee, tax]; topics [sender, recipient]. Trade price ex-costs: buy (ethIn-fee-tax)/tokensOut, sell
 *     (ethOut+fee+tax)/tokensIn. Real reserve = sum of buy (ethIn-fee-tax) minus sell (ethOut+fee+tax);
 *     bonding = real reserve / threshold.
 *   - DEX paid: DexScreener orders/v1/robinhood/<token> (free), only for tokens that pass the chain entry checks.
 *   - ETH/USD: Binance ETHUSDT hourly (for the $200 1h volume exit).
 * Entry (almost_bonded preset, lib/trench/rules.ts), checked on each minute's close, one position per token:
 *   age <= 24 h; bonding 35%-70%; creator tax <= 2% (tax/ethIn of the token's trades); pullback 15%-45% from the
 *   token's highest close so far; unique traders over 24 h >= 90; buys/sells over 6 h >= 1 (counts); and, in the
 *   "+dexpaid" variant, a DexScreener paid order within 90 minutes of launch.
 *   NOT rebuildable and left out: dev %, fresh wallet %, the X account / contract-posted / narrative checks, Rushr
 *   risk level, the top-3-by-trades shortcut, add-on buys. The backtest is therefore a looser picker than live.
 * Exits on 1-minute closes:
 *   v1 (live until 18 Nov): stop -25%; ladder +50% sell 50%, +100% sell 25%; trailing 30% from the peak after the
 *     first ladder; sell at 95% bonding; time stop 6 h unless +20%; flat bonding 2 h (< 1 point); flow exit when 1 h
 *     buys/sells < 0.7 or 1 h volume < $200.
 *   v2 (Research, trench-exit-v2-decision.md): take 50% at +20%, then stop at entry +3% and trail 15% from the peak;
 *     stop -25% only after two consecutive closes below; flow exit (same test) = full exit at a loss, trail 10% in
 *     profit; 95% bonding, time stop and flat bonding as v1; no re-entry.
 *   A token that graduates while held is sold at its last curve price. Positions are followed up to 72 h after launch.
 * Costs per fill: the curve's fee + creator tax as seen in its trades, + 0.25% Rushr fee, + 0.5% slippage; "2x" doubles
 * them. Returns are per trade on the ETH put in.
 * PASS (all, for v2 with the chain-only picker; the +dexpaid variant is reported too): at least 50 closed trades;
 * mean return per trade > 0 after costs and > 0 at 2x costs; mean > 0 with the best trade removed; worst trade
 * >= -35%; mean > 0 in each of the two weeks separately; v2 mean > v1 mean on the same entries.
 * Anything else = NO-GO. Known optimism: entries and exits fill at the minute close with no queue or failed sells.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-trench-backtest.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const CACHE = process.env.TRENCH_CACHE ?? join(tmpdir(), "zolva-trench");
const FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const LAUNCH = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const BUY = "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455";
const SELL = "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df";
const DAYS = 14;
const SEC_PER_BLOCK = 0.11;
const RUSHR_FEE = 0.0025;
const SLIPPAGE = 0.005;

type Trade = [t: number, side: 0 | 1, eth: number, tokens: number, fee: number, tax: number, trader: string];
type Launch = { token: string; curve: string; t: number; block: number; threshold: number };

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}
const RPC = readDevVars().ROBINHOOD_RPC_URL;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(60_000) })).json()) as { result?: T; error?: { message: string } };
      if (r.error) throw new Error(r.error.message);
      return r.result as T;
    } catch (cause) {
      if (attempt >= 4) throw cause;
      await sleep(1000 * (attempt + 1));
    }
  }
}
type Log = { address: string; topics: string[]; data: string; blockNumber: string; blockTimestamp?: string };
const word = (data: string, i: number) => BigInt("0x" + data.slice(2 + i * 64, 2 + (i + 1) * 64));
const eth = (v: bigint) => Number(v) / 1e18;

/** Logs in [from, to], splitting the range when the node refuses a large answer. */
async function logs(filter: Record<string, unknown>, from: number, to: number, out: Log[]): Promise<void> {
  try {
    out.push(...(await rpc<Log[]>("eth_getLogs", [{ ...filter, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }])));
  } catch (cause) {
    if (to - from < 50) throw cause;
    const mid = Math.floor((from + to) / 2);
    await logs(filter, from, mid, out);
    await logs(filter, mid + 1, to, out);
  }
}

async function loadData(latest: number) {
  const file = join(CACHE, "trades.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as { launches: Launch[]; trades: Record<string, Trade[]> };
  const start = latest - Math.round((DAYS * 86400) / SEC_PER_BLOCK) - Math.round(86400 / SEC_PER_BLOCK); // a day of warm-up launches
  const launches: Launch[] = [];
  const trades: Record<string, Trade[]> = {};
  const STEP = 20_000;
  for (let from = start; from <= latest; from += STEP) {
    const to = Math.min(latest, from + STEP - 1);
    const factoryLogs: Log[] = [];
    await logs({ address: FACTORY, topics: [LAUNCH] }, from, to, factoryLogs);
    for (const l of factoryLogs) {
      const curve = "0x" + l.topics[2].slice(26);
      launches.push({ token: "0x" + l.topics[1].slice(26), curve, t: parseInt(l.blockTimestamp ?? "0", 16), block: parseInt(l.blockNumber, 16), threshold: eth(word(l.data, 2)) || 4.2 });
      trades[curve] = [];
    }
    const tradeLogs: Log[] = [];
    await logs({ topics: [[BUY, SELL]] }, from, to, tradeLogs);
    for (const l of tradeLogs) {
      const list = trades[l.address.toLowerCase()];
      if (!list) continue;
      const t = parseInt(l.blockTimestamp ?? "0", 16);
      if (l.topics[0] === BUY) list.push([t, 0, eth(word(l.data, 0)), eth(word(l.data, 1)), eth(word(l.data, 2)), eth(word(l.data, 3)), "0x" + l.topics[2].slice(26)]);
      else list.push([t, 1, eth(word(l.data, 1)), eth(word(l.data, 0)), eth(word(l.data, 2)), eth(word(l.data, 3)), "0x" + l.topics[1].slice(26)]);
    }
    if (((from - start) / STEP) % 25 === 0) console.log(`  blocks ${from}..${to}: ${launches.length} launches so far`);
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify({ launches, trades }));
  return { launches, trades };
}

type Minute = { t: number; close: number; bonding: number; buys1h: number; sells1h: number; vol1hEth: number; buys6h: number; sells6h: number; traders24h: number; high: number };

/** Minute closes and rolling stats for one curve, from launch to its last trade. */
function minutes(launch: Launch, list: Trade[]): Minute[] {
  if (!list.length) return [];
  const out: Minute[] = [];
  let reserve = 0;
  let high = 0;
  let i = 0;
  const first = Math.floor(list[0][0] / 60) * 60;
  // Entries happen within 24 h of launch; positions are followed for at most 72 h after launch.
  const last = Math.min(Math.floor(list[list.length - 1][0] / 60) * 60, Math.floor((launch.t + 72 * 3600) / 60) * 60);
  let close = 0;
  const window: Trade[] = [];
  for (let m = first; m <= last; m += 60) {
    while (i < list.length && list[i][0] < m + 60) {
      const [, side, ethAmt, tokens, fee, tax] = list[i];
      if (side === 0) {
        reserve += ethAmt - fee - tax;
        if (tokens > 0) close = (ethAmt - fee - tax) / tokens;
      } else {
        reserve -= ethAmt + fee + tax;
        if (tokens > 0) close = (ethAmt + fee + tax) / tokens;
      }
      window.push(list[i]);
      i++;
    }
    while (window.length && window[0][0] < m + 60 - 86400) window.shift();
    if (close <= 0) continue;
    high = Math.max(high, close);
    const since = (s: number) => window.filter((x) => x[0] >= m + 60 - s);
    const h1 = since(3600);
    const h6 = since(6 * 3600);
    out.push({
      t: m,
      close,
      bonding: reserve / launch.threshold,
      buys1h: h1.filter((x) => x[1] === 0).length,
      sells1h: h1.filter((x) => x[1] === 1).length,
      vol1hEth: h1.reduce((s, x) => s + x[2], 0),
      buys6h: h6.filter((x) => x[1] === 0).length,
      sells6h: h6.filter((x) => x[1] === 1).length,
      traders24h: new Set(window.map((x) => x[6])).size,
      high,
    });
  }
  return out;
}

type Result = { token: string; t: number; ret: number; exit: string };

/** One position from minute index `e`, with exit v1 or v2. Returns the ETH return after costs. */
function ride(ms: Minute[], e: number, version: 1 | 2, costEach: number, ethUsd: (t: number) => number): Result & { tokenIndex: number } {
  const entry = ms[e].close;
  let open = 1; // share of the position still held
  let banked = 0; // value realised so far, in entry units (1 = the whole entry)
  let peak = entry;
  let stopLine = entry * 0.75;
  let trail: number | null = null;
  let ladders = 0;
  let below = 0;
  const sell = (share: number, price: number) => {
    banked += share * (price / entry) * (1 - costEach);
    open -= share;
  };
  let exit = "end of data";
  for (let k = e + 1; k < ms.length; k++) {
    const m = ms[k];
    const p = m.close;
    peak = Math.max(peak, p);
    const gain = p / entry - 1;
    const hours = (m.t - ms[e].t) / 3600;
    const weakFlow = (m.sells1h > 0 ? m.buys1h / m.sells1h : Infinity) < 0.7 || m.vol1hEth * ethUsd(m.t) < 200;
    if (m.bonding >= 0.95) {
      sell(open, p);
      exit = "95% bonding";
      break;
    }
    if (version === 1) {
      if (p <= stopLine) {
        sell(open, p);
        exit = "stop";
        break;
      }
      if (ladders === 0 && gain >= 0.5) {
        sell(0.5, p);
        ladders = 1;
        trail = 0.3;
      }
      if (ladders === 1 && gain >= 1.0) {
        sell(0.25, p);
        ladders = 2;
      }
      if (trail != null && p <= peak * (1 - trail)) {
        sell(open, p);
        exit = "trail";
        break;
      }
      if (weakFlow) {
        sell(open, p);
        exit = "flow";
        break;
      }
    } else {
      below = p <= stopLine ? below + 1 : 0;
      if ((ladders === 0 && below >= 2) || (ladders === 1 && p <= stopLine)) {
        sell(open, p);
        exit = ladders ? "break-even stop" : "stop (2 closes)";
        break;
      }
      if (ladders === 0 && gain >= 0.2) {
        sell(0.5, p);
        ladders = 1;
        stopLine = entry * 1.03;
        trail = 0.15;
      }
      if (weakFlow) {
        if (p < entry) {
          sell(open, p);
          exit = "flow (loss)";
          break;
        }
        trail = Math.min(trail ?? 0.1, 0.1);
      }
      if (trail != null && p <= peak * (1 - trail)) {
        sell(open, p);
        exit = "trail";
        break;
      }
    }
    if (hours >= 6 && gain < 0.2 && ladders === 0) {
      sell(open, p);
      exit = "time stop";
      break;
    }
    const twoHoursAgo = ms.findLast((x) => x.t <= m.t - 7200);
    if (twoHoursAgo && twoHoursAgo.t >= ms[e].t && Math.abs(m.bonding - twoHoursAgo.bonding) < 0.01) {
      sell(open, p);
      exit = "flat bonding";
      break;
    }
  }
  if (open > 1e-9) sell(open, ms[ms.length - 1].close);
  return { token: "", t: ms[e].t, ret: banked * (1 - costEach) - 1, exit, tokenIndex: e };
}

async function dexPaid(token: string, launchT: number): Promise<boolean> {
  const file = join(CACHE, "dex", `${token}.json`);
  let body: unknown;
  if (existsSync(file)) body = JSON.parse(readFileSync(file, "utf8"));
  else {
    await sleep(1100);
    const r = await fetch(`https://api.dexscreener.com/orders/v1/robinhood/${token}`, { signal: AbortSignal.timeout(30_000) });
    body = r.ok ? await r.json() : [];
    mkdirSync(join(CACHE, "dex"), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  }
  const orders = (Array.isArray(body) ? body : ((body as { orders?: unknown[] })?.orders ?? [])) as { status?: string; paymentTimestamp?: number }[];
  return orders.some((o) => o.status === "approved" && o.paymentTimestamp != null && o.paymentTimestamp / 1000 - launchT <= 90 * 60);
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

async function main() {
  const latest = parseInt(await rpc<string>("eth_blockNumber", []), 16);
  const now = Date.now();
  const ethRows = await binanceCloses(BINANCE_SYMBOLS.ETH, Math.floor(now / HOUR_MS) * HOUR_MS);
  const ethAt = new Map(ethRows);
  const ethUsd = (t: number) => ethAt.get(Math.floor((t * 1000) / HOUR_MS) * HOUR_MS) ?? ethRows[ethRows.length - 1][1];
  const { launches, trades } = await loadData(latest);
  const cutoff = now / 1000 - DAYS * 86400;
  const tested = launches.filter((l) => l.t >= cutoff);
  console.log(`${tested.length} PONS launches in the last ${DAYS} days (${launches.length} loaded incl. warm-up); ${tested.filter((l) => (trades[l.curve] ?? []).length > 0).length} with trades.`);

  const entries: { launch: Launch; ms: Minute[]; e: number; cost: number }[] = [];
  let reached35 = 0;
  let graduated = 0;
  for (const launch of tested) {
    const list = (trades[launch.curve] ?? []).sort((a, b) => a[0] - b[0]);
    const ms = minutes(launch, list);
    if (ms.some((m) => m.bonding >= 0.35)) reached35++;
    if (ms.some((m) => m.bonding >= 1)) graduated++;
    const buys = list.filter((x) => x[1] === 0);
    const ethIn = buys.reduce((s, x) => s + x[2], 0);
    const taxRate = ethIn > 0 ? buys.reduce((s, x) => s + x[5], 0) / ethIn : 0;
    const feeRate = ethIn > 0 ? buys.reduce((s, x) => s + x[4], 0) / ethIn : 0.01;
    if (taxRate > 0.02) continue;
    const e = ms.findIndex((m) => {
      if (m.t - launch.t > 24 * 3600) return false;
      const pullback = 1 - m.close / m.high;
      return m.bonding >= 0.35 && m.bonding <= 0.7 && pullback >= 0.15 && pullback <= 0.45 && m.traders24h >= 90 && m.buys6h >= m.sells6h && m.buys6h > 0;
    });
    if (e >= 0 && e < ms.length - 1) entries.push({ launch, ms, e, cost: feeRate + taxRate + RUSHR_FEE + SLIPPAGE });
  }
  console.log(`Reached 35% bonding: ${reached35}; graduated (100%): ${graduated}; entries by the chain-only picker: ${entries.length}.`);

  const paid = new Set<string>();
  for (const x of entries) if (await dexPaid(x.launch.token, x.launch.t)) paid.add(x.launch.token);

  const weekSplit = now / 1000 - 7 * 86400;
  const report = (label: string, set: typeof entries) => {
    console.log(`\n${label}: ${set.length} trades`);
    const rows: Record<string, number[]> = {};
    for (const version of [1, 2] as const) {
      for (const scale of [1, 2]) {
        const results = set.map((x) => ({ ...ride(x.ms, x.e, version, x.cost * scale, ethUsd), token: x.launch.token }));
        const rets = results.map((r) => r.ret).sort((a, b) => a - b);
        const mean = (v: number[]) => (v.length ? v.reduce((s, y) => s + y, 0) / v.length : NaN);
        const withoutBest = mean(rets.slice(0, -1));
        const w1 = results.filter((r) => r.t < weekSplit).map((r) => r.ret);
        const w2 = results.filter((r) => r.t >= weekSplit).map((r) => r.ret);
        const exits: Record<string, number> = {};
        for (const r of results) exits[r.exit] = (exits[r.exit] ?? 0) + 1;
        rows[`v${version}x${scale}`] = [mean(rets), withoutBest, rets[0], mean(w1), mean(w2), rets.filter((r) => r > 0).length / Math.max(1, rets.length)];
        console.log(
          `  exit v${version} costs ${scale}x: mean ${pct(mean(rets))}, median ${pct(rets[Math.floor(rets.length / 2)] ?? NaN)}, without best ${pct(withoutBest)}, worst ${pct(rets[0] ?? NaN)}, best ${pct(rets[rets.length - 1] ?? NaN)}, wins ${(rows[`v${version}x${scale}`][5] * 100).toFixed(0)}%, week1 ${pct(mean(w1))} (${w1.length}), week2 ${pct(mean(w2))} (${w2.length}); exits ${JSON.stringify(exits)}`,
        );
      }
    }
    const v2 = rows.v2x1;
    const pass = set.length >= 50 && v2[0] > 0 && rows.v2x2[0] > 0 && v2[1] > 0 && v2[2] >= -0.35 && v2[3] > 0 && v2[4] > 0 && v2[0] > rows.v1x1[0];
    console.log(`  GATE (v2): ${pass ? "PASS" : "NO-GO"}`);
  };
  report("Chain-only picker (gate)", entries);
  report("+ DEX paid within 90 min", entries.filter((x) => paid.has(x.launch.token)));
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
