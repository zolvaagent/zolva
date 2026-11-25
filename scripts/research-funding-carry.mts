/**
 * Research only (read-only, public data): funding carry (2026-11-25, owner "ya, jalankan tes leverage dan funding
 * carry"). Question: how much does a price-neutral position (long the coin, short the same amount of its perp)
 * earn from funding, after costs, 2021 to now?
 *
 * Fixed before the first run:
 *   - Data: Binance USDT-margined funding (data.binance.vision monthly files, cached by research-alt-funding.mts in
 *     FUNDING_CACHE), BTC ETH SOL XRP NEAR ZEC. Price moves cancel between the legs; basis is ignored.
 *   - Capital split: half buys the coin, half is margin for the short (1x short, no liquidation risk below a
 *     +95% spike). So the account earns funding x 0.5 a year. Shown as % of the whole account.
 *   - Rules: "always" (stay in the carry), "f10" (open when the 7 day average funding, annualised, is above 10%;
 *     close when it falls below 0), "f20" (same with 20%).
 *   - Costs: 0.1% a fill on each leg (spot fee plus perp slippage), 2 legs to open and 2 to close.
 *   - Reported: per year % of the account, worst run of losses (paying negative funding), the share of time in
 *     the trade, and the average $ per week on $1,000.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-funding-carry.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CACHE = process.env.FUNDING_CACHE ?? join(tmpdir(), "zolva-binance-funding");
const COINS = (process.env.COINS ?? "BTC,ETH,SOL,XRP,NEAR,ZEC").split(",");
const START = Date.UTC(2021, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const FILL = 0.001;
const SHARE = 0.5;
const RULES: { name: string; open: number | null; close: number }[] = [
  { name: "always", open: null, close: -Infinity },
  { name: "f10", open: 0.1, close: 0 },
  { name: "f20", open: 0.2, close: 0 },
];

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`.padStart(7);

for (const coin of COINS) {
  const file = join(CACHE, `${coin}USDT-funding.json`);
  if (!existsSync(file)) {
    console.log(`${coin}: no cached funding (run research-alt-funding.mts with FUNDING_SOURCE=vision first)`);
    continue;
  }
  const events: [number, number][] = (JSON.parse(readFileSync(file, "utf8")) as [number, number][]).sort((a, b) => a[0] - b[0]);
  console.log(`\n${coin} (${events.length} funding events, last ${new Date(events.at(-1)![0]).toISOString().slice(0, 10)})`);
  for (const rule of RULES) {
    let account = 1;
    let open = rule.open === null;
    if (open) account -= 2 * FILL * SHARE;
    const yearStart = new Map<number, number>();
    let inTrade = 0;
    let counted = 0;
    let lossRun = 0;
    let worstRun = 0;
    let start = 1;
    let started = false;
    for (let k = 0; k < events.length; k++) {
      const [time, rate] = events[k];
      // 7 day average of past events, annualised (events every 8h before 2024 for most coins; use time span).
      const windowStart = time - 7 * 86_400_000;
      let sum = 0;
      for (let j = k - 1; j >= 0 && events[j][0] >= windowStart; j--) sum += events[j][1];
      const f7 = sum * (365 / 7);
      if (time < START) continue;
      if (!started) {
        started = true;
        start = account;
      }
      const year = new Date(time).getUTCFullYear();
      if (!yearStart.has(year)) yearStart.set(year, account);
      if (rule.open !== null) {
        if (!open && f7 > rule.open) {
          open = true;
          account -= 2 * FILL * SHARE * account;
        } else if (open && f7 < rule.close) {
          open = false;
          account -= 2 * FILL * SHARE * account;
        }
      }
      counted++;
      if (open) {
        inTrade++;
        // The short receives positive funding (pays negative) on SHARE of the account.
        const earned = rate * SHARE * account;
        account += earned;
        lossRun = earned < 0 ? lossRun + earned : 0;
        worstRun = Math.min(worstRun, lossRun / account);
      }
    }
    const years = YEARS.map((y, i) => {
      const s = yearStart.get(y);
      const e = yearStart.get(YEARS[i + 1]) ?? account;
      return s ? e / s - 1 : NaN;
    });
    const span = (events.at(-1)![0] - START) / (365 * 86_400_000);
    const cagr = Math.pow(account / start, 1 / span) - 1;
    console.log(
      `  ${rule.name.padEnd(7)} ${years.map(pct).join("")}  total ${pct(account / start - 1)}  in trade ${pct(inTrade / Math.max(1, counted))}  worst losing run ${pct(worstRun)}  cagr ${pct(cagr)}  $/wk on $1k ${((1000 * cagr) / 52).toFixed(2)}`,
    );
  }
}
