# Down market research (2026-11-03)

Question: can an agent stay ahead in a falling market without shorting (no perps)?
Script: `scripts/research-down-market.mts` (read-only). Markets: the 14 live-tradable v3
markets (13 in the older windows: BTC has 49 days of history). Hourly closes with the
outlier filter, 7 days of warm-up before each window.

## Ideas tested

1. **Dip buying:** scan every market each hour, buy the one furthest below its 48h
   average (z < -2.5), sell once z is back to 0.5 or the stop loss (10%) hits. One
   position at a time, the whole agent in it.
2. **Rotation:** once a day, hold the 2 strongest markets by 7-day return, but only
   those going up (positive return and above their 48h average).
3. **Cash:** when no market qualifies for 2, stay in USDG.

Benchmark: equal-weight hold of the same markets.

## Results

| Cost per trade | Window | Hold | 1 dips only | 2+3 rotation | 1+2+3 combined |
|---|---|---|---|---|---|
| 0.5% (engine) | last 30d (Oct 4 to Nov 3) | -11.7% | -3.2% | -23.8% | -18.3% |
| 0.5% | 30d before (Sep 4 to Oct 4) | +2.0% | +0.4% | -22.5% | -16.2% |
| 0.5% | last 60d | -9.5% | -2.8% | -40.6% | -31.2% |
| 0.3% | last 30d | -11.5% | **+3.9%** | | |
| 0.3% | 30d before | +2.2% | **+5.8%** | | |
| 0.3% | last 60d | -9.4% | **+9.9%** | | |
| 0.2% | last 30d | -11.5% | +7.6% | -17.2% | -10.6% |
| 0.2% | 30d before | +2.3% | +8.6% | -14.6% | -8.5% |
| 0.2% | last 60d | -9.3% | +16.8% | -29.1% | -18.1% |

Dips only: 26 to 35 trades per 30 days, worst drop 7 to 16%. The combined idea across 8
nearby settings (lookback 72 or 168 h, rebalance 24 or 72 h, stop 10 or 15%) never
beat holding in all three windows.

## What it means

- **Rotation (2+3) does not work here.** It lost in every window and every setting:
  markets on Robinhood Chain reverse too often, so it buys late and sells late, and pays
  the cost each time. Adding it to dip buying only made dip buying worse.
- **Dip buying (1) is the only idea that stayed ahead in the falling month**, and it
  was positive in all three windows once the cost per trade is 0.3% or less.
- **Cost decides it.** Real fills so far cost about 0.1% in price plus gas (the GME
  buy: +0.11% vs the decision price, $0.008 gas on $3.40, so about 0.3% at that size,
  about 0.1% at $100). At the engine's 0.5% it is only "lose less than holding".
- **Caveats:** 2 to 3 months of data, one strategy setting (z -2.5 / 0.5 from
  2026-10-15, not re-tuned here), and 13 to 14 markets. It can still be luck.

## Built: dip hunter (2026-11-03)

Preset strategy `dip_hunter` in `lib/engine` and `prototype/engine.js` (parity test).
The mean reversion signal on every market; while it holds nothing it buys only the market
with the lowest z score, so it holds one position at a time. A sell frees the slot for the
next hour, not the same one (the research script could sell and buy in one hour). The only
strategy allowed more than 3 markets (up to 20, migration `20261103000100_dip_hunter.sql`).
Not in Studio. Running as the paper agent "Lab · Dip Hunter" on the 14 live markets,
100% per position, 10% stop. Paper fills pay 0.5%, so it will look worse than the 0.3%
results above.
