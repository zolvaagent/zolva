/**
 * Research only (read-only): Rushr memecoin step 0 (2026-11-16). Owner approved the research gate only
 * ("ok mari kita coba"); brief: side-session-notes/local_00420f47-…/rushr-memecoin-step0-brief.md.
 * Question: does any simple hourly, long-only rule on graduated Robinhood Chain memecoins beat holding USDG after
 * real costs, with dead and rugged tokens included?
 *
 * Everything below was committed before the first run.
 *
 * Data (gentle, read only, no key): Rushr `GET /tokens?column=migrated` (every graduated token Rushr lists, dead
 * ones included; no unknown token is requested, so no hydration), then `GET /tokens/<a>/candles?interval=1h` for
 * each listed token, one call per ~1.5 s, cached in MEME_CACHE. Only hours after the token's migration count.
 * Tokens with a contract tax use their own buy/sell tax; the pool fee is venue_fee_bps (100 when null).
 *
 * Universe at an hour t: graduated at least 3 hours before t, USD volume of the last 24 hours >= $10,000 (liquidity
 * is null for most tokens, so volume is the liquidity proxy), a candle at t.
 * Rules (decided on hourly closes only, like runHour):
 *   A momentum   buy when the close is up more than 20% over the last 6 hours
 *   B volume     buy when this hour's volume is more than 3x the average of the 24 hours before and the hour closed up
 *   C A + safety A, but only tokens whose Rushr risk is not "high" (today's label: a look-ahead, flagged as such)
 * Exits for all: stop loss 25% below entry, take profit +50%, time stop 24 hours (all on hourly closes).
 * Sizing: $50 capital, 20% of starting capital per position, at most 5 open, one position per token,
 * 6 hour cooldown after an exit. Entries ranked by the signal (largest 6h return / volume ratio first).
 * Costs per fill: token tax (buy tax on buys, sell tax on sells) + pool fee + 0.25% Rushr fee + 0.5% slippage +
 * $0.03 gas. "Double" doubles every part.
 * Benchmark: USDG (0%). Context: equal-weight buy of every token 3 hours after graduation, held to now.
 * Pass gate (brief): total return > 0 after costs and > 0 at double costs; still > 0 without the best token;
 * state worst drawdown and trades; sample size and "weak test" if under a few weeks.
 * Also: share of post-graduation hours whose low is under half the open (falls the hourly agent cannot react to).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-memecoin.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://api.rushr.trade";
const CACHE = process.env.MEME_CACHE ?? join(tmpdir(), "zolva-meme");
const HOUR = 3600;
const CAPITAL = 50;
const SLOT = 0.2;
const MAX_OPEN = 5;
const STOP = 0.25;
const TAKE = 0.5;
const MAX_HOLD = 24;
const COOLDOWN = 6;
const RUSHR_FEE = 0.0025;
const SLIPPAGE = 0.005;
const GAS_USD = 0.03;

type Token = {
  address: string;
  symbol: string;
  migrated_at: string | null;
  risk: string | null;
  buy_tax_bps: number | null;
  sell_tax_bps: number | null;
  venue_fee_bps: number | null;
};
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cached<T>(name: string, url: string): Promise<T> {
  const file = join(CACHE, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  await sleep(1500);
  const response = await fetch(url, { headers: { "User-Agent": "research-script" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const body = await response.json();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(body));
  return body as T;
}

type Rule = "A momentum" | "B volume" | "C momentum+safety";

function simulate(rule: Rule, tokens: { token: Token; candles: Candle[]; migrated: number }[], costScale: number, exclude?: string) {
  const byToken = tokens.filter((t) => t.token.address !== exclude);
  const index = new Map(byToken.map((t) => [t.token.address, new Map(t.candles.map((c) => [c.time, c]))]));
  const hours = [...new Set(byToken.flatMap((t) => t.candles.map((c) => c.time)))].sort((a, b) => a - b);
  const lastClose = new Map<string, number>();
  const cost = (bps: number | null, fallback: number) => ((bps ?? fallback) / 10_000) * costScale;
  let cash = CAPITAL;
  const open = new Map<string, { units: number; entry: number; at: number }>();
  const cooldown = new Map<string, number>();
  let peak = CAPITAL;
  let worst = 0;
  let trades = 0;
  let gas = 0;
  const pnlByToken = new Map<string, number>();
  for (const t of hours) {
    for (const { token } of byToken) {
      const c = index.get(token.address)!.get(t);
      if (c) lastClose.set(token.address, c.close);
    }
    // exits on this hour's close
    for (const [address, p] of open) {
      const c = index.get(address)!.get(t);
      if (!c) continue;
      const change = c.close / p.entry - 1;
      if (change <= -STOP || change >= TAKE || (t - p.at) / HOUR >= MAX_HOLD) {
        const token = byToken.find((x) => x.token.address === address)!.token;
        const fee = cost(token.sell_tax_bps, 0) + cost(token.venue_fee_bps, 100) + RUSHR_FEE * costScale + SLIPPAGE * costScale;
        const proceeds = p.units * c.close * (1 - fee) - GAS_USD * costScale;
        gas += GAS_USD * costScale;
        cash += proceeds;
        pnlByToken.set(address, (pnlByToken.get(address) ?? 0) + proceeds);
        open.delete(address);
        cooldown.set(address, t + COOLDOWN * HOUR);
        trades++;
      }
    }
    // entries
    const candidates: { address: string; score: number; token: Token; close: number }[] = [];
    for (const { token, candles, migrated } of byToken) {
      if (open.has(token.address) || (cooldown.get(token.address) ?? 0) > t) continue;
      if (t < migrated + 3 * HOUR) continue;
      if (rule === "C momentum+safety" && token.risk === "high") continue;
      const i = candles.findIndex((c) => c.time === t);
      if (i < 24) continue;
      const c = candles[i];
      const window = candles.slice(i - 24, i);
      const vol24 = candles.filter((x) => x.time > t - 24 * HOUR && x.time <= t).reduce((s, x) => s + x.volume, 0);
      if (vol24 < 10_000) continue;
      if (rule === "B volume") {
        const avg = window.reduce((s, x) => s + x.volume, 0) / 24;
        if (avg > 0 && c.volume > 3 * avg && c.close > c.open) candidates.push({ address: token.address, score: c.volume / avg, token, close: c.close });
      } else {
        const back = candles.find((x) => x.time === t - 6 * HOUR);
        if (back && c.close / back.close - 1 > 0.2) candidates.push({ address: token.address, score: c.close / back.close, token, close: c.close });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const cand of candidates) {
      if (open.size >= MAX_OPEN) break;
      const spend = Math.min(CAPITAL * SLOT, cash);
      if (spend < 1) break;
      const fee = cost(cand.token.buy_tax_bps, 0) + cost(cand.token.venue_fee_bps, 100) + RUSHR_FEE * costScale + SLIPPAGE * costScale;
      cash -= spend;
      gas += GAS_USD * costScale;
      const units = ((spend - GAS_USD * costScale) * (1 - fee)) / cand.close;
      open.set(cand.address, { units, entry: cand.close, at: t });
      pnlByToken.set(cand.address, (pnlByToken.get(cand.address) ?? 0) - spend);
      trades++;
    }
    const equity = cash + [...open].reduce((s, [a, p]) => s + p.units * (lastClose.get(a) ?? p.entry), 0);
    peak = Math.max(peak, equity);
    worst = Math.max(worst, (peak - equity) / peak);
  }
  const final = cash + [...open].reduce((s, [a, p]) => s + p.units * (lastClose.get(a) ?? p.entry), 0);
  for (const [a, p] of open) pnlByToken.set(a, (pnlByToken.get(a) ?? 0) + p.units * (lastClose.get(a) ?? p.entry));
  const best = [...pnlByToken].sort((a, b) => b[1] - a[1])[0];
  return { ret: final / CAPITAL - 1, drop: worst, trades, gasShare: gas / CAPITAL, best };
}

async function main() {
  const list = await cached<{ tokens: Token[] }>("migrated.json", `${API}/tokens?column=migrated`);
  const tokens: { token: Token; candles: Candle[]; migrated: number }[] = [];
  for (const token of list.tokens) {
    if (!token.migrated_at) continue;
    const body = await cached<{ candles: Candle[] }>(`${token.address}-1h.json`, `${API}/tokens/${token.address}/candles?interval=1h`);
    const migrated = Math.floor(Date.parse(token.migrated_at) / 1000 / HOUR) * HOUR;
    const candles = body.candles.filter((c) => c.time >= migrated).sort((a, b) => a.time - b.time);
    if (candles.length) tokens.push({ token, candles, migrated });
  }
  const first = Math.min(...tokens.map((t) => t.migrated));
  const last = Math.max(...tokens.flatMap((t) => t.candles.map((c) => c.time)));
  const allHours = tokens.reduce((s, t) => s + t.candles.length, 0);
  const rugHours = tokens.reduce((s, t) => s + t.candles.filter((c) => c.low < 0.5 * c.open).length, 0);
  const rugTokens = tokens.filter((t) => t.candles.some((c) => c.low < 0.5 * c.open)).length;
  const taxes = tokens.map((t) => ((t.token.buy_tax_bps ?? 0) + (t.token.sell_tax_bps ?? 0) + 2 * (t.token.venue_fee_bps ?? 100)) / 100).sort((a, b) => a - b);
  console.log(`${tokens.length} graduated tokens with post-graduation candles, ${new Date(first * 1000).toISOString().slice(0, 13)} to ${new Date(last * 1000).toISOString().slice(0, 13)} UTC, ${allHours} token-hours.`);
  console.log(`Round-trip token tax + pool fee: median ${taxes[Math.floor(taxes.length / 2)].toFixed(1)}%, range ${taxes[0].toFixed(1)}% to ${taxes[taxes.length - 1].toFixed(1)}% (before Rushr fee, slippage, gas).`);
  console.log(`Hours whose low is under half the open: ${rugHours} of ${allHours} (${((rugHours / allHours) * 100).toFixed(1)}%), in ${rugTokens} of ${tokens.length} tokens.`);

  // context: equal-weight buy 3h after graduation, hold to now, with one buy and no sell cost
  const holds = tokens
    .map((t) => {
      const start = t.candles.find((c) => c.time >= t.migrated + 3 * HOUR);
      return start ? t.candles[t.candles.length - 1].close / start.close - 1 : null;
    })
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  console.log(`Context, buy 3h after graduation and hold (before costs): median ${(holds[Math.floor(holds.length / 2)] * 100).toFixed(0)}%, mean ${((holds.reduce((s, x) => s + x, 0) / holds.length) * 100).toFixed(0)}%, ${holds.filter((x) => x < -0.5).length} of ${holds.length} down more than 50%.\n`);

  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  console.log("rule                 costs   return    worst drop  trades  gas/capital  best token        without best");
  for (const rule of ["A momentum", "B volume", "C momentum+safety"] as Rule[]) {
    for (const scale of [1, 2]) {
      const r = simulate(rule, tokens, scale);
      const bestSymbol = r.best ? tokens.find((t) => t.token.address === r.best![0])?.token.symbol ?? "?" : "-";
      const without = r.best ? simulate(rule, tokens, scale, r.best[0]).ret : r.ret;
      console.log(`${rule.padEnd(20)} ${scale === 1 ? "real  " : "double"}  ${pct(r.ret).padStart(7)}  ${pct(r.drop).padStart(10)}  ${String(r.trades).padStart(6)}  ${pct(r.gasShare).padStart(11)}  ${(bestSymbol + " " + (r.best ? `$${r.best[1].toFixed(2)}` : "")).padEnd(16)}  ${pct(without).padStart(12)}`);
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
