# Perps research, Phase 0 (2026-11-07)

Phase 0 of [perps-plan.md](perps-plan.md). Sources are the venues' own docs and public
APIs, read on 2026-11-07. Press articles were used only for context.

## Verdict: gate passed, with Lighter RH

Lighter runs a separate exchange on Robinhood Chain ("Lighter RH"). It meets every
Phase 0 condition except one, which only the owner can confirm: whether the owner's
region may use it. Arcus is the backup.

## Lighter RH (first choice)

Read from the public API `https://api.rh.lighter.xyz/api/v1/orderBookDetails` on
2026-11-07.

**Markets.** 71 active perps, among them:
- Indices and ETFs: SPY, QQQ, SOXL, SLV, USO, SGOV.
- Stocks we already trade: NVDA, TSLA, PLTR, CRCL, SPCX, AMC, AAPL, MSFT, GOOGL, AMZN,
  META, COIN, INTC, AMD, MU and more.
- Gold and silver: XAU, XAG.
- Crypto: BTC, ETH, SOL, HYPE, XRP and more.
- Pre-IPO markets: ANTHROPIC, OPENAI.

GME is not listed.

**Depth.** 24h volume was $83M for SPY, $78M for BTC, $53M for QQQ, $32M for ETH and
$32M for NVDA. Most mid-size stocks trade $2M to $20M a day. This is far deeper than
the Uniswap pools.

**Costs.**
- Fees: 0% maker and 0% taker on every market (`taker_fee` and `maker_fee` "0.0000").
  This matches the Standard account tier in the docs: "Maker Fee 0%, Taker Fee 0%",
  with Standard accounts on RH at 0%/0%.
- Funding: paid every hour, peer to peer, with no exchange fee. On ETH and SPY the
  average over the last 31 days was about 0.0005 to 0.0007% an hour, roughly 4 to 6%
  a year. The sign convention and units must be checked in Phase 1 before relying on
  them.
- Minimum order: $10.
- Speed bump: 300 ms on taker orders. This does not matter for an hourly bot.

**Leverage.** Up to 50x on the large markets (initial margin 2%) and 10x on most
stocks. Margin can be cross or isolated. 1x isolated should be possible (initial
margin 10000) but is not stated explicitly in the docs.

**Collateral.** USDG on Robinhood Chain, deposited through contract
`0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d` (chain ID 466324 in Lighter's docs). This
is the same dollar the live agents already hold.

**Bot access.**
- Python SDK `lighter-python` (Apache 2.0), a Go SDK and a WASM signer.
- Orders are signed with an API key (index 4 to 156 or 158 to 254 on RH), which is
  registered once with the wallet's signature.
- What a key can do: trade, cancel, change leverage, use sub-accounts, make *secure*
  withdrawals (to the owner's own address only) and same-owner transfers.
- What a key cannot do alone: transfer to another owner or make a fast withdrawal.
  Both also need the wallet signature.
- So a leaked key can lose money through bad trades, but it cannot send funds to a
  stranger.
- Sub-accounts: up to 8 on RH, each with its own balances and keys. This allows one
  sub-account per live agent, with a capped deposit.
- REST limit on Standard: 60 requests a minute. This is plenty for an hourly bot.

**Data for the backtest.**
- `GET /api/v1/candles`: hourly candles, 500 per call, back to 2026-06-26 (about 4.5
  months). That is more history than our own BTC data (52 days).
- `GET /api/v1/fundings`: hourly funding, 750 per call.
- Both endpoints are public and free.

**Open questions.**
- Region and terms: the press lists the UK, US, Canada, Switzerland, UAE and Singapore
  as excluded. Lighter's docs mention restricted regions but give no list. **The owner
  should read Lighter's terms of use before Phase 3.**
- Perp prices follow an index, not our Uniswap token price. The paper engine would
  need Lighter's prices for perps agents.
- The zero fees are for Standard accounts today. Fees could change; the backtest will
  also run at 0.05% to leave a margin.

## Arcus (backup)

dYdX Labs and Robinhood Crypto.

**Status.** Perps are in a beta that rolls out by cohort from a waitlist, live since
July 1, 2026. "Full launch later in the year" has no date.

**Markets.** About 35 RWA perps plus crypto perps (BTC, ETH, SOL and others), up to
50x leverage.

**Fees** (since Oct 23, 2026, tier 0):

| Market | Maker | Taker |
|---|---|---|
| RWA perps | 0% | 0.0225% |
| Crypto perps | 0.015% | 0.045% |

**Funding.** Paid hourly. The base is SOFR + 0.5% a year for RWAs and 0.01% per 8h
for crypto.

**Bot API.**
- REST and WebSocket at `api.arcus.xyz`, plus an MCP server.
- An API key (Ed25519) is valid for up to 180 days and can be scoped to a sub-account.
- We found **no trade-only permission** for keys.

**Access.** Not available in the US, UK, Canada and other restricted jurisdictions.

**Why it is the backup.** The perps are still waitlisted, fees are not zero, and the
key permissions are less clear.

## Other

- **Hyperliquid HIP-3 equity perps:** about 0.03% maker and 0.09% taker. It runs on
  its own chain, not Robinhood Chain. Not needed while Lighter RH works.
- **Morpho borrow-to-short:** see [shorting-research.md](shorting-research.md). It is
  too small next to Lighter RH.

## What this changes in the plan

1. **Phase 1 can use real perp data.** Backtest on Lighter RH hourly candles and real
   funding from 2026-06-26. Run at 0% and 0.05% cost, for Spike Fade, Swing, Dip Hunter
   and a 1 to 2 hour hold, on crypto and on stocks.
2. **Custody is simpler than expected.**
   - Funds stay on Robinhood Chain, in USDG.
   - Withdrawals by key can only go back to the owner's address.
   - Each live agent can get its own sub-account with a capped deposit.
3. **Scalping is back on the table at 0% fees.** It will still be tested at 0.05%, and
   the 300 ms taker delay does not matter at an hourly pace.

## Phase 1 backtest (2026-11-07)

`scripts/research-perps.mts`, read only. It uses Lighter RH's own hourly candles and
real hourly funding from 2026-07-01 (stock perps start on 2026-06-30). Settings: 1x, a
10% stop, a 48h z score, and a 7 day warm-up. Windows: the full 122 days and four
pieces of about 30 days. Return on the agent, at 0.05% cost per trade (0% in
brackets).

**Crypto** (BTC, ETH, SOL):

| Window | Holding | Spike fade | Dip + fade | Swing | Swing, 2h hold |
|---|---|---|---|---|---|
| 122 days | +19.7% | +15.5% (19.8) | +8.7% (12.1) | +14.8% (21.8) | -6.7% (16.3) |
| Last 30d (falling) | -14.1% | +12.1% | +6.7% | +13.2% | +6.4% |
| 30d before | +6.3% | +4.8% | +4.5% | +9.1% | +1.3% |
| 30d before that (strong rise) | +28.4% | -9.2% | -5.3% | -9.8% | -15.1% |
| First 32d | +1.8% | +8.3% | +5.4% | +7.9% | +2.0% |
| Worst drop (122d) | | 20.4% | 10.4% | 21.5% | 17.7% |

**Stocks** (15 perps: SPY QQQ NVDA TSLA PLTR CRCL SPCX AAPL MSFT GOOGL AMZN META COIN AMD
MU), 0.05% cost:

| Window | Holding | Spike fade | Dip + fade | Swing | Swing, 2h hold |
|---|---|---|---|---|---|
| 122 days | -2.2% | +8.0% | +4.4% | -8.6% | -53.4% |
| Last 30d | -14.4% | +1.8% | -12.1% | -13.6% | -29.7% |
| 30d before | +5.6% | +2.5% | +3.0% | +12.5% | -27.2% |
| 30d before that | +5.9% | +13.5% | +22.4% | -10.9% | -6.7% |
| First 32d | +3.1% | -16.4% | -11.3% | -4.5% | -2.9% |
| Worst drop (122d) | | 19.7% | 19.1% | 23.7% | 55.2% |

Funding was small: at most about 1.6% of the agent over 122 days.

**Gate: failed.** No strategy was positive in every window with a worst drop of 10% or
less.
- **Scalping: no.** A 1 hour hold lost in almost every case, even at 0% cost (crypto
  -24.7%, stocks -77.3% over 122 days at 0.05%). The 2 hour hold only works at exactly
  0% cost.
- **Every mean reversion strategy lost in the month crypto rose 28%.** They bet against
  moves, so a strong trend hurts them.
- **Closest: Dip + fade on crypto.** It was positive in 4 of 5 windows, with a worst drop
  of about 10% and -5.3% in the rising month. It still trailed holding over the full
  period (+8.7% against +19.7%) but did much better in falling months.
- **On stocks, Spike Fade** was positive in 4 of 5 windows but had a 20% worst drop.

**Next options:**
1. Re-test in about 3 weeks with more data.
2. A cheap backtest of a trend filter (no shorts while the 7 day trend is strongly up,
   no dip buys while it is strongly down). This targets exactly the windows that failed.

Phase 2 (paper perps mode) waits until a strategy passes the gate.

## Trend filter (2026-11-07)

`TREND_FILTER=x`: entries against the trend are skipped. No short while the market is up
more than x over the last 7 days, and no long while it is down more than x. Exits are
unchanged. Data and settings are the same as Phase 1, at 0.05% cost.

**Crypto, filter at 5%:**

| Strategy | 122 days | Last 30d | 30d before | Rising month (+28%) | First 32d | Worst drop |
|---|---|---|---|---|---|---|
| Holding | +19.7% | -14.1% | +6.3% | +28.4% | +1.8% | |
| Dip + fade | +12.2% | +7.6% | +3.6% | **-2.8%** | +5.1% | **6.0%** |
| Swing | +23.3% | +15.6% | +7.2% | -4.6% | +7.3% | 12.8% |
| Spike fade | +18.7% | +12.1% | +3.9% | -4.2% | +6.4% | 12.1% |

The filter cut the loss in the rising month roughly in half, and it lowered every worst
drop.

**Sensitivity: the result is fragile.**

| Crypto, 122 days | No filter | 3% | 5% | 8% |
|---|---|---|---|---|
| Dip + fade | +8.7% | +4.3% | +12.2% | +7.3% |
| Swing | +14.8% | +8.9% | +23.3% | +11.8% |

Only the 5% level helps; 3% and 8% are worse than no filter. A real effect would not
peak at one value like this, so 5% may simply fit this sample.

**Stocks: noise.** Swing went from -8.6% (no filter) to +36.2% (3%) to -12.7% (5%).
Results that jump this much between nearby settings cannot be trusted. Stock perps stay
out.

**Gate: still failed.** No strategy is positive in every window. The closest is Dip +
fade on crypto with the 5% filter: -2.8% in the rising month and a 6% worst drop.
However, the 5% level was chosen on this same data.

**Decision:** freeze the rule as it is now (Dip + fade and Swing on BTC, ETH and SOL,
with the 5% filter) and re-run it on about 2026-11-28 using only the new hours. If it
still holds on data it has never seen, start Phase 2. If not, perps strategies stay
parked.

## Rule search with a held-out month (2026-11-07)

`scripts/research-perps-search.mts` (read only; data from `scripts/lighter-history.mts`).

**Method**
- Training data: 2026-07-15 to 2026-10-08, split into 3 folds.
- Held out: the last 30 days (2026-10-08 to 2026-11-07). The search never looked at them.
- Costs: 0.05% per trade and real hourly funding. Positions are 1x, and each market gets
  an equal share of the agent (one sub-account per market).

**What was searched:** 5,580 combinations of rule and market group.
- Rule families: mean reversion (with and without a trend filter), breakouts, moving
  average crosses, and time series momentum. Each was tried long only, short only or
  both, with a 5% or 10% stop.
- Market groups:
  - BTC ETH SOL
  - BTC ETH SOL HYPE XRP
  - SPY QQQ
  - the 15 stock perps
  - Gold and silver were left out, because their history starts later.

**Rules for passing**
- Training: positive in all 3 folds, a worst drop of at most 10%, and at least 15 trades.
  403 combinations passed.
- Robustness: at least 75% of the neighbouring settings must also be positive. 323 of the
  403 passed this too.
- Lock-in: the top 3 (no two from the same family and group) were chosen from training
  alone, then run on the held-out month once.

| Rule (locked in) | Training folds | Training | Worst drop | Held-out month | Holding that month |
|---|---|---|---|---|---|
| **Deep dip, BTC ETH SOL**: buy when z < -2.5 against the 96h average, sell at z >= +0.5, 5% stop | +5.0 / +5.6 / +3.6% | +14.0% | 2.7% | **+1.7%** (drop 4.4%, 16 trades) | -14.1% |
| Same rule on BTC ETH SOL HYPE XRP, 10% stop | +4.0 / +4.5 / +4.6% | +12.5% | 2.5% | -0.4% (drop 5.7%) | -13.7% |
| Breakout long on 15 stock perps (new 48h high, exit on a 48h low, 5% stop) | +2.1 / +2.0 / +2.4% | +6.0% | 3.7% | -8.9% (drop 10.0%) | -14.4% |

**Reading**
- **One rule passed every test: deep dip on BTC, ETH and SOL.**
  - It was positive in all 3 training folds and in the held-out month.
  - Its worst drop was below 5% everywhere.
  - In the held-out month it made +1.7% while holding lost 14%.
  - It is long only and trades rarely (about 2 trades a week).
  - It is close to the Dip Hunter idea: a longer 96h average, a 5% stop, and on perps
    at 0.05% cost.
- **Every rule that passed is long only.** The training period was a crypto rise of
  37%, which explains this. Short rules never passed all 3 folds.
- **The other two locked-in rules failed the held-out month**, though both lost less
  than holding.

**Caveats**
- The sample is small: 24 trades in training and 16 held out.
- The held-out month was a single falling stretch.
- Many near-identical variants passed, because the trend filter rarely bound for this
  rule.
- The held-out month has now been used and cannot be used for selection again. The next
  honest test is fresh hours after 2026-11-07.

**Next:** Phase 2 for this one rule, or wait for the 2026-11-28 re-test on fresh hours.

## The deep dip rule on other perps (2026-11-10)

`scripts/research-perps-engine-check.mts` runs the real engine with the frozen rule
(DEEP_DIP_96, 5% stop) from 2026-07-08 (after warm-up) to 2026-11-10. The other groups are
markets the rule search never saw.

| Markets | Whole period | First half | Second half | Last 30 days | Worst drop | Round trips | Holding, last 30d |
|---|---|---|---|---|---|---|---|
| BTC ETH SOL (the Lab agent) | +14.6% | +10.8% | +3.6% | -0.1% | 6.6% | 42 | -15.3% |
| **HYPE ZEC XRP LIT NEAR** (new) | **+19.4%** | +7.1% | +11.5% | **+10.8%** | 9.1% | 54 | -16.1% |
| All 8 crypto perps | +18.0% | +8.4% | +8.9% | +6.9% | 8.4% | 96 | -15.8% |
| 9 stock and index perps | -3.3% | -0.8% | -2.3% | -2.9% | 5.4% | 113 | -6.3% |
| Gold and silver (from 2026-09-01) | -3.2% | +0.8% | -4.0% | -5.9% | 10.1% | 23 | -7.1% |

**Reading**
- On five crypto perps it had never seen, the rule was positive in both halves and in
  the last 30 days, while holding them fell 16%. This is the strongest evidence so far that
  the rule is not fitted to BTC, ETH and SOL.
- It does not carry over to stocks or metals. It made many trades there, but small losses.
- BTC, ETH and SOL alone had a flat last month (-0.1%). The earlier held-out figure (+1.7%)
  ended on 2026-11-07; the following days were slightly negative.

**Plan:** a second Lab agent on HYPE ZEC XRP LIT NEAR (max 20% each, 5% stop). Together
with the first one, that is about 7 round trips a week, so 30 or more within 4 to 5 weeks.
Stocks and metals stay out.

## Leverage, Phase L0 (2026-11-13)

Phase L0 of [plan-actions-perps-live.md](plan-actions-perps-live.md) section 2. Read only:
`scripts/research-perps-leverage.mts` on Lighter RH history to 2026-11-13 11:00 UTC (cache
refreshed today from the free public API, `UNTIL=1794571200000`). No engine change.

**Verdict: no. No strategy passes at 2x, 3x, 5x or 10x.** The "Later: leverage" task closes as
"no", and L1 to L3 are not built. Even 2x fails, mainly on the worst drop.

**Model**
- Isolated margin per market. The margin is what the engine puts in at 1x (min(cash, equity x
  max %)); notional = margin x leverage, capped at the market's maximum.
- 0.05% of the notional per fill; funding on the notional every hour, from the margin.
- Liquidation from the hour's candle: a long when the low reaches entry x (1 - 1/L + mmf), a
  short when the high reaches entry x (1 + 1/L - mmf). The margin is lost, and the 1% fee on the
  notional is charged from free cash.
- The stop is still checked on the close. The Lab agents' settings and market choice.
- Lighter's limits (orderBookDetails, read today): BTC and ETH 50x (mmf 1.2%), SOL 25x (2.4%),
  HYPE and XRP 20x (3%), ZEC and NEAR 10x (6%), LIT 5x (12%). At 10x, LIT stays at 5x.
- Check: at 1x the model matches the real engine (`simulate`) on the whole period. Deep Dip
  +8.1% vs +8.1%, Alts +19.7% vs +19.9%, Spike Fade +5.0% vs +5.0%.

**Windows.** Each one starts flat with $10,000.
- Whole period: Jul 8 to Nov 13.
- The two halves of Jul 8 to Nov 7.
- The four 30 day blocks of Jul 8 to Nov 7. The table shows the worst of the four.
- Fresh: the 156 hours after 2026-11-07, which no rule was chosen on.

**Pass**: positive in every window, beats holding on the fresh hours, a worst drop of at most
15%, zero liquidations, and at least 30 round trips. Drop, liquidations and round trips are for
the whole period.

**Deep Dip, BTC ETH SOL** (33% each, 5% stop)

| Leverage | Whole | 1st half | 2nd half | Worst month | Fresh | Worst drop | Liq. | Trips | Pass |
|---|---|---|---|---|---|---|---|---|---|
| Holding | +4.6% | +32.2% | -10.5% | -14.9% | -11.4% | | | | |
| 1x | +8.1% | +10.8% | +4.9% | +2.7% | **-4.9%** | 9.5% | 0 | 45 | no: fresh |
| 2x | +15.4% | +22.4% | +9.2% | +5.1% | -9.9% | 18.8% | 0 | 45 | no: fresh, drop |
| 3x | +21.7% | +34.9% | +13.1% | +7.2% | -14.8% | 27.8% | 0 | 45 | no: fresh, below holding, drop |
| 5x | +30.3% | +62.6% | +18.8% | +10.7% | -24.6% | 44.5% | 0 | 45 | no |
| 10x | +20.3% | +150.4% | +18.9% | +13.8% | -49.0% | 77.2% | 0 | 45 | no |

**Deep Dip Alts, HYPE ZEC XRP LIT NEAR** (20% each, 5% stop)

| Leverage | Whole | 1st half | 2nd half | Worst month | Fresh | Worst drop | Liq. | Trips | Pass |
|---|---|---|---|---|---|---|---|---|---|
| Holding | +38.9% | +62.4% | +2.3% | -13.3% | -12.1% | | | | |
| 1x | +19.7% | +7.1% | +10.4% | **-2.5%** (Sep to Oct) | +3.0% | 9.2% | 0 | 57 | no: Sep to Oct |
| 2x | +41.4% | +14.4% | +20.6% | -5.2% | +5.9% | 17.7% | 0 | 57 | no: Sep to Oct, drop |
| 3x | +64.8% | +22.0% | +30.5% | -8.0% | +8.8% | 25.7% | 0 | 57 | no: Sep to Oct, drop |
| 5x | +115.5% | +37.6% | +48.6% | -14.0% | +14.6% | 40.1% | 0 | 57 | no |
| 10x (LIT 5x) | -49.5% | +39.8% | -51.0% | -42.1% | -12.6% | 78.8% | **13** | 61 | no |

**Spike Fade, ETH BTC** (one short, 100%, 10% stop)

| Leverage | Whole | 1st half | 2nd half | Worst month | Fresh | Worst drop | Liq. | Trips | Pass |
|---|---|---|---|---|---|---|---|---|---|
| Holding | +8.2% | +33.4% | -8.2% | -11.1% | -11.5% | | | | |
| 1x | +5.0% | -8.3% | +13.5% | -11.7% | 0.0% (no trade) | 20.7% | 0 | 34 | no |
| 2x | +5.8% | -18.7% | +27.9% | -24.5% | 0.0% | 39.0% | 0 | 34 | no |
| 3x | +1.4% | -31.0% | +43.3% | -38.2% | 0.0% | 55.0% | 0 | 34 | no |
| 5x | -25.0% | -59.3% | +76.5% | -65.9% | 0.0% | 79.8% | 0 | 34 | no |
| 10x | -100% | -100% | +166.7% | -100% | 0.0% | 100% | 1 | 13 | no |

**Bounce Short, all 8 crypto perps** (one short, 100%, 10% stop, as Lab · Perps Bounce Short)

| Leverage | Whole | 1st half | 2nd half | Worst month | Fresh | Worst drop | Liq. | Trips | Pass |
|---|---|---|---|---|---|---|---|---|---|
| Holding | +26.0% | +51.1% | -2.5% | -13.9% | -11.8% | | | | |
| 1x | +45.1% | +4.1% | +30.4% | **-0.5%** (Jul 8 to Aug 9) | +6.8% | 13.4% | 0 | 35 | no: Jul 8 to Aug 9 |
| 2x | +102.4% | +5.3% | +68.8% | -3.9% | +13.9% | 26.2% | 0 | 35 | no: first month, drop |
| 3x | +170.7% | +3.0% | +116.7% | -10.1% | +21.3% | 38.4% | 0 | 35 | no: first month, drop |
| 5x (LIT 5x) | -100% | -100% | +249.6% | -100% | +37.1% | 100% | 1 | 9 | no |
| 10x (LIT 5x) | -100% | -100% | -100% | -100% | -100% | 100% | 1 | 3 | no |

**The same with a 5% stop** (the stop of the planned Lab · Perps Bounce Short 3x)

| Leverage | Whole | 1st half | 2nd half | Worst month | Fresh | Worst drop | Liq. | Trips | Pass |
|---|---|---|---|---|---|---|---|---|---|
| 1x | +47.2% | +10.5% | +24.7% | +4.7% | +6.8% | 9.2% | 0 | 36 | yes (in-sample, see below) |
| 2x | +109.8% | +19.9% | +53.7% | +9.4% | +13.9% | 18.1% | 0 | 36 | no: drop |
| 3x | +189.3% | +27.6% | +87.0% | +11.3% | +21.3% | 26.6% | 0 | 36 | no: drop |
| 5x (LIT 5x) | +395.0% | +35.7% | +166.0% | +8.4% | +37.1% | 42.5% | 0 | 36 | no: drop |
| 10x (LIT 5x) | -100% | -100% | +140.7% | -100% | -100% | 100% | 1 | 3 | no |

**Reading**
- **The worst drop grows about in step with leverage.** At 1x the best rules drop 9% to 10%, so
  the 15% limit allows at most about 1.5x. Every 2x row fails on the drop (17.7% to 39%).
- **Liquidation is not the main risk at 2x to 5x.** No 2x or 3x row was liquidated. It decides
  the outcome once the liquidation line sits inside the stop:
  - shorts at 10x (about +9% on BTC and ETH);
  - LIT at 5x (+8%, inside the 10% stop);
  - ZEC and NEAR at 10x (-4%).
  With one short holding all of the agent, a single liquidation ends the agent (-100%).
- **Leverage adds no information on paper.** 2x at 33% per market is the same exposure as 1x at
  66%. Its only benefit is less capital locked with real money, and the drop limit rules that out.
- **New warning for 1x Deep Dip on BTC ETH SOL:** -4.9% on the fresh hours (holding -11.4%).
  It still beats holding, but it is negative. The 2026-11-28 re-test still decides.
- **Bounce Short with a 5% stop passes at 1x, but this is not evidence.** The 5% stop was not
  the frozen setting (the Lab agent uses 10%), and the rule and its 24h guard were chosen on
  these same months. Only the 156 fresh hours are out of sample: 4 trades, +6.8%.
- **The planned Lab · Perps Bounce Short 3x** (5% stop, working copy of `house.ts`) fails this
  gate: worst drop 26.6%, though no liquidation. Its engine model also liquidates on the close
  only (at 95% of the margin). Hourly wicks are not modelled there.
- **Limits of this test.**
  - The drop is measured on hourly closes. Drops inside an hour are larger, which makes leverage
    look better than it is.
  - The whole period has only 34 to 61 round trips per strategy.
  - Sizing the 1% liquidation fee on the notional is conservative.

## Long and short in one agent, all 8 crypto perps (2026-11-11)

Owner question: is there an agent that opens both long and short? Not yet (spike fade only
shorts; everything else only buys). `scripts/research-perps.mts` already had the two shapes
from docs/shorting-research.md; groups `alts` (HYPE ZEC LIT XRP NEAR) and `crypto8` (all eight)
were added. 1x, 10% stop, 0.05% per trade, real hourly funding, Lighter history from Jul 8.

- **Dip + fade**: two slots, one long (deepest dip, z < -2.5 vs the 48h average, out at z >= 0.5)
  and one short (highest spike, z > 2.5, out at z <= -0.5).
- **Swing**: one slot, either side, the most extreme market beyond |z| 2.5.
- **Trend filter 5%**: no short while the market is up more than 5% over 7 days, no long while
  it is down more than 5%.

All eight crypto perps (window: return, worst drop; holding in brackets):

| Window | Holding | Dip + fade | Dip + fade, trend 5% | Swing | Swing, trend 5% |
|---|---|---|---|---|---|
| Jul 8 to Nov 11 (126 d) | +37.8% | +23.2%, 19.1% | **+29.6%, 9.7%** | +25.9%, 42.7% | +30.5%, 22.1% |
| Last 30 d | -20.1% | +4.3% | **+14.8%, 3.6%** | +27.2% | +28.5%, 6.2% |
| 30 to 60 d ago | +21.4% | -12.7% | **+0.6%, 8.1%** | -38.0% | -9.9%, 22.1% |
| 60 to 90 d ago | +53.9% | +11.3% | **+5.8%, 8.7%** | +25.7% | -5.1% |
| 90 to 126 d ago | -2.3% | +19.1% | **+4.1%, 9.7%** | +22.0% | +14.4% |

**Reading**
- Swing earns the most in falling months but shorts straight into rallies: -38% with a 43% drop
  in the Sep to Oct rise. The trend filter halves that, still a 22% drop. Too risky.
- **Dip + fade with the 5% trend filter on all eight is the only long-and-short shape that was
  positive in every window with a worst drop under 10%** (72 trades). It trails holding in the
  two rising months and beats it in the two falling ones.
- Caveat: the 5% filter and the 8-market basket were picked after seeing this data, so this is
  in-sample. BTC ETH SOL alone: +12.1% (drop 6.0%) with the filter; the alts alone +17.0% (drop
  10.0%). Next step, if built: a paper Lab agent as the out-of-sample test, not real money.

## Short the bounce in a downtrend (2026-11-13)

Trigger: during a sharp crypto sell-off no agent was short. Spike fade shorts only z > 2.5, and
Dip + fade's short side is the same rule, so a falling market never fires them.
`scripts/research-short-trend.mts` (read-only) tests short-only rules on the 8 crypto perps, 1x,
0.05% per trade, real funding, 10% stop, one slot:

- **Bounce:** down more than 5% over 7 days, short once z >= 0.5 (and <= 2.5) against the 48h
  average, cover at z <= -0.5.
- **Breakdown** (close below the 72h low, same gate): lost in every window (-7.6% to -15.0%),
  like the earlier trend shorts. Dropped.

| Window | Holding | Bounce | + 24h guard (no short after +1.5% in 24h) | Worst drop with guard |
|---|---|---|---|---|
| Last 6 days | -14.3% | +8.8% (5 trades) | +6.8% (4) | 5.5% |
| 30 d to 7 Nov | -12.1% | +22.6% | +14.4% (11) | 7.3% |
| Sep to Oct rally | +18.8% | +4.0% | +14.0% (7) | 2.9% |
| Aug to Sep rally | +54.4% | +9.0% | +7.6% (5) | 2.0% |

- Neighbouring settings (7 day gate 3% / 8%, z 0 / 1.0) were positive in the falling windows
  but not in the Sep to Oct rally (-26% to +18%, drop up to 38%), so the rule depends on the
  market regime. More slots (3 or 8, each 1/N of the agent) only diluted it to +1% to +4%.
- **The 24h guard was chosen after seeing the rally window fail without it**, and each window has
  4 to 11 trades: in-sample. The last 6 days are the only fresh data and had 4 trades.
- Built as the preset `bounce_short` (perps, paper only, migration
  `20261113000100_bounce_short.sql`), and one paper Lab agent, **Lab · Perps Bounce Short**
  (all 8 perps, 100% of the agent, 10% stop), as the out-of-sample test. Review after a week
  of live paper hours: trades, return against holding, and whether it stayed flat in rallies.

### Support breaks and market structure (2026-11-13)

Question from the owner: short early, on a break of support on a small timeframe, and use higher
highs / higher lows / lower highs / lower lows. The smallest timeframe we have is 1 hour (closes).
Swing points = highest or lowest close of K hours either side, known K hours later (no look-ahead).
Same 8 perps, 1x, 0.05% cost, 10% stop, one slot.

- **Short on a support break** (`scripts/research-short-structure.mts`; close below the latest swing
  low, needs a lower high, optionally a lower low or a 7 day downtrend; exit on a close above the
  lower high, trailed down): positive only in the last 6 days (+3.7% to +14.2%, 1 to 5 trades). The
  three 30 day windows before it: K 3h -2.5% to -27.5%, K 6h -16.6% to +7.2%; wins only 20% to 55%.
  Same lesson as the 72h-low breakdown: breaks reverse before the move pays.
- **Bounce short plus structure** (`STRUCT_K` in `scripts/research-short-trend.mts`; enter only
  under a lower high, cover on a higher high): worse than bounce short alone in every setting.
  Baseline +6.8% / +14.4% / +14.0% / +7.6%; with K 3h 0% (no trades) / +8.4% / +2.1% / 0%; K 6h
  +3.5% / -0.2% / -2.6% / -1.9%; K 12h +5.1% / -2.5% / +8.3% / +0.3%; K 6h with a lower low
  -5.2% to +2.4%. The extra rule removes trades and the winners with them.
- Not built. Lab · Perps Bounce Short keeps the plain rule.

### The same ideas on 15 minute bars (2026-11-13)

`scripts/research-short-15m.mts` (Lighter serves 5m and 15m candles; `loadMarketBars` in
`scripts/lighter-history.mts`). Same 8 perps, 1x, 0.05% cost, 10% stop, one slot, decisions at each
15 minute close, all hour counts scaled to bars. K = swing half-width in bars (4 = 1 h, 8 = 2 h, 16 = 4 h).

| Window (holding) | Bounce | Support break, best / worst of 9 variants |
|---|---|---|
| Last 6 d (-12.0%) | +8.4% (6 trades) | +0.2% to +11.8% closed trades only |
| 30 d to 7 Nov (-12.1%) | +11.6% | -15.0% to +19.0% |
| Sep to Oct rally (+19.4%) | +18.9% | -32.2% to +13.2% |
| Aug to Sep rally (+53.8%) | +6.2% | -37.4% to -0.9% |

- **Bounce on 15 minute bars is as good as on 1 hour bars** (worst drop 3.6% to 10.7%), so a finer
  timeframe adds nothing to it and the hourly agent does not need a 15 minute tick.
- **Support breaks lose in both rallies for every variant** (win rate 14% to 40%, up to 85 trades a
  month and 45% worst drop at K 1 h). Finer bars mean more false breaks, not earlier wins.
- Caveat: a few variants show a large return with 0 closed trades (an open position at the end of
  the window, not counted in "trades").
- Not built. Lab · Perps Bounce Short keeps the plain hourly rule.

### Bounce short with leverage (2026-11-13)

`LEVERAGE=n` in `scripts/research-short-trend.mts`: position = n x the margin, liquidation at a 95% loss
of the margin, stop as a price distance. Hourly closes only, so intra-hour wicks (real liquidations)
are not modelled and the results are optimistic. Bounce short with the 24h guard, 0.05% cost, same four windows:

| Leverage / stop | Last 6 d | 30 d to 7 Nov | Sep to Oct rally | Aug to Sep rally | Worst drop |
|---|---|---|---|---|---|
| 1x, 5% | +6.8% | +9.4% | +14.0% | +7.6% | 2.9% to 7.5% |
| 3x, 5% | +21.3% | +27.7% | +46.4% | +24.1% | 6.0% to 20.7% |
| 10x, 5% | +83.1% | +48.1% | +220.6% | +97.5% | 19.8% to 66.1% |
| 10x, 2% | -21.4% | +88.2% | +43.1% | +97.5% | 19.8% to 62.6% |

Leverage multiplies the return and the drops, it does not add an edge: every extra point comes
with the same trades (4 to 14 per window). At 10x one 5% stop costs half the margin and two in a
row three quarters; a 2% stop is hit by ordinary noise (-21% in the last 6 days).

## Strategy by regime (2026-11-13)

Goal (owner): agents whose strategies pay in a given market condition, not tied to a coin.
`scripts/research-regime-matrix.mts` (read-only): 7 rules run continuously over the whole Lighter
history (3,078 hours after warm-up, 8 crypto perps, 1x, 0.05% cost, real funding, 10% stop). The regime of an
hour is fixed before looking at results and uses only data up to that hour, from the equal-weight basket:
SHOCK = 48h hourly volatility >= 0.8%; else UP / DOWN = 7 day move of +5% / -5% or more; else RANGE. Hours:
UP 474 (15%), RANGE 1,487 (48%), DOWN 365 (12%), SHOCK 752 (24%). Return of each regime's hours, entries made in them:

| Rule | UP | RANGE | DOWN | SHOCK | Whole period |
|---|---|---|---|---|---|
| hold basket | +10.7% | -1.1% | +1.2% | +11.2% | +23.2% |
| bounce short | -3.1% (0 entries) | +17.1% (22) | +15.7% (7) | +13.5% (7) | +49.0% |
| spike fade short | -25.6% (7) | +11.3% (26) | +1.3% (5) | +41.1% (12) | +18.4% |
| dip long | -7.1% (8) | +32.8% (21) | -9.4% (4) | +3.6% (8) | +15.8% |
| dip + fade, trend filter | -3.8% (10) | +10.3% (43) | +5.3% (9) | +16.5% (11) | +30.3% |
| momentum long | **+35.2% (6)** | -25.6% (16) | -6.1% (7) | -22.7% (10) | -27.0% |
| breakout long | -2.6% (7) | +14.2% (25) | -4.4% (5) | -22.3% (9) | -17.3% |
| breakdown short | -4.7% (8) | -26.6% (30) | -7.7% (1) | -16.9% (13) | -46.3% |

Sensitivity (7 day band 3% / 8%, shock threshold 0.6% / 1.2%; four more runs) kept these patterns:
- **Momentum long pays only in UP** (+21.7% to +72.0%) and loses in every other regime (-1.8% to -57.5%).
- **Spike fade short loses in UP** in every run (-8.3% to -25.6%, drops up to 26%); it pays in RANGE and SHOCK.
- **Dip long pays in RANGE** (+16.0% to +32.8%) and is flat to negative in UP and DOWN.
- **Bounce short is positive in RANGE, DOWN and SHOCK** in every run; UP has almost no entries.
- Dip + fade is the most even rule (positive in RANGE, DOWN, SHOCK; slightly negative in UP at most bands).
- Breakdown short loses everywhere; breakout long only pays in RANGE.

Caveats: in-sample, one up/down cycle; many cells have under 10 entries (UP and DOWN are only 12% to 23% of hours,
so their cells are thin); 7 rules x 4 regimes is 28 cells, some positive by chance; the shock label covers a
quarter of the hours. A regime-gated candidate (for example momentum only while the basket is UP) is not
proven until it has fresh paper hours.

### Momentum only while the market is up (2026-11-13)

Question: can momentum long (the one rule that paid in UP, +35.2% from 6 entries) be gated to rising
markets? `scripts/research-regime-matrix.mts`, same data and costs. Ungated momentum: -27.0% for the whole
period (first half +26.4%, second half -42.3%, 36% of 39 trades won).

| Gate on entry | Whole period | Trades won | First / second half |
|---|---|---|---|
| none | -27.0% | 36% (39 closed) | +26.4% / -42.3% |
| this asset up 3% / 5% / 8% over 7 days | -5.2% / -0.2% / -39.2% | 41% / 43% / 32% | +4.5% / +3.0% / -4.1% first half; second half negative |
| the basket up 3% over 7 days | +12.1% | 35% (20 closed) | +11.9% / +0.1% |
| the basket up 5% over 7 days | +77.2% | 58% (12 closed) | +50.4% / +17.8% |
| the basket up 8% over 7 days | +22.1% | 38% (13 closed) | +38.9% / -12.1% |

- **A per-asset gate does not work**: an asset up 5% over 7 days is often a single coin pumping in a range
  market, and it still lost 17% to 37% in RANGE hours.
- **A market-level gate (basket 7 day move) turns the rule positive** at 3%, 5% and 8%, but the size depends on
  the band: +12% to +77%, with only 12 to 20 trades, and the second half is flat to negative at 3% and 8%.
  Treat the +77% as the best of three bands, not as the expected result.
- Momentum with a basket gate would need the engine to compute the basket's 7 day move from the agent's own
  markets (not built). Not proven; candidate only.

### Hold-out on 2020-2026 spot data: the regime findings do not hold (2026-11-13)

The matrix above came from 128 days. To test it, the same frozen rules ran on Binance spot hourly closes (public
market data mirror, `scripts/binance-history.mts`) for the six coins that are the same asset as a Lighter perp:
BTC, ETH, SOL, XRP, NEAR, ZEC, from 2020-10-15 to 2026-06-30 (50,016 hours, before the Lighter window).
Spot, so no funding; 1x; 10% stop; 100% of the agent in one slot. The basket index is the equal-weight
hourly-rebalanced return index (the first version, an average of normalised prices, was dominated by SOL and
NEAR and was fixed; it only affects regime labels and the basket gate).

| Rule | Whole 2020-10 to 2026-06 (cost 0.05%) | Cost 0 | By year 2021 / 22 / 23 / 24 / 25 |
|---|---|---|---|
| hold (equal-weight index) | +1,840% | | +914% / -77% / +165% / +129% / +26% |
| bounce short | **-92.6%** (521 trades, 72% won) | -87.5% | -60% / -1% / -7% / -71% / -12% |
| spike fade short | **-99.0%** | -99.0% | -94% / -29% / -14% / -48% / 0% |
| dip long | **-84.1%** | -70.6% | +56% / -86% / +33% / +42% / -6% |
| dip + fade, trend filter | **-88.6%** | -81.7% | -19% / -48% / +36% / -10% / -57% |
| momentum long | +2,251% | +3,809% | +259% / -77% / +89% / +405% / -32% |
| momentum, basket up 5% gate | +1,739% | +2,328% | +287% / -58% / +61% / +149% / +58% |
| breakout long | +386% | +875% | +218% / -78% / +7% / +17% / +320% |
| breakdown short | -98.0% | -95.9% | -76% / -15% / -76% / -65% / -32% |

- **Costs are not the reason**: with cost 0 the mean-reversion and short rules still lose 70% to 99%.
- **The short and mean-reversion rules found on the 128 days (bounce short, spike fade, dip long, dip + fade) do not
  hold out.** They lose in the bull years (2021, 2024) by shorting pullbacks that keep going up; bounce short only
  broke even in the 2022 bear year (-1%). The Jul-Nov 2026 window was one falling leg.
- **Consistency check on the overlap** (same Jul-Nov 2026 window on Binance spot): bounce short +28.0% (Lighter +49.0%),
  momentum with the basket gate +85.3% (Lighter +77.2%); but dip long -2.6% (Lighter +15.8%), dip + fade -4.1%
  (Lighter +30.3%) and spike fade -45.0% (Lighter +18.4%). So the simulation matches for two rules, and the
  mean-reversion results move a lot just from using 6 coins on spot instead of 8 perps: fragile.
- **Momentum and breakout long make money over the long sample, but this is mostly market beta on six coins that
  survived** (the index rose 18x), with -77% / -78% years (2022). They are not safe for users as they are.
- Limits: spot not perps; survivor coins; one-slot 100% sizing; no funding (shorts would pay in bull years, so the
  short results are if anything too good).

Reading: no rule here is robust across regimes yet. Next research needs a higher-timeframe regime filter chosen on
the long sample first (not the Lighter window), position sizing and drawdown limits, and a pass criterion fixed in
advance (for example positive in at least 4 of 6 years and worst drop under 30%), tested on BTC and ETH, which have
the least survivor bias.

## Stress test: Chip Breakout (spot, NVDA MU TSM) on long history (2026-11-13)

Owner asked before putting real money in. The published agent be4b8f92 (by Zolva, custom rules: buy when price
crosses above the 72 hour high, sell below the 48 hour average -2%, take profit 12%, stop 8%, 33% per token) was
+2.8% after 29 days live while holding was -12.5%. Same frozen rules through the real engine (`simulate`, spot
cost 0.5% per fill), `scripts/research-chip-breakout.mts`, read only.

| Data | Whole | Worst drop | By year (agent / equal-weight hold) |
|---|---|---|---|
| Yahoo daily closes held 24h, 2016-11 to now (coarse proxy) | **-1.5%** (774 trades, 36% won) | **64.5%** | 2017 +38/+71, 2018 -23/-19, 2019 +15/+70, 2020 +33/+85, 2021 -19/+54, 2022 **-53**/-44, 2023 +19/+118, 2024 +42/+88, 2025 +4/+112, 2026 -9/+68 |
| Yahoo 60m incl. pre/post market, 2023-12 to now | **-45.6%** (354 trades, 35% won) | 59.6% | 2024 -29/+87, 2025 -22/+111, 2026 0/+67 |
| Zolva on-chain candles, 2026-08 to now | -12.3% | 19.8% | before the agent started -14.9 / -0.5; since the agent +3.1 / -11.5 |

- **Fails the pass rule** (positive in at least 4 of 6 years and worst drop under 30%): daily proxy has 6 of 10
  positive years but a 64.5% drop (2022); the hourly data has no positive full year.
- **It never beats holding** these three stocks in any year of the long data, including the down years (2018, 2022).
  The live month looks good only because the chips fell and the agent sat in cash.
- The on-chain run since the agent started (+3.1%) matches the live record (+2.8%), so the simulation is faithful;
  the six weeks before it started, on the same token prices, were -14.9% while holding was flat.
- Likely cause: a breakout rule with a tight exit trades about 80 to 130 times a year at 0.5% a fill and wins
  about 35% of the time, so costs and whipsaws eat the trend.
- Limits: Yahoo prices are the stocks, not the tokens (the tokens also move on weekends and nights, about 0.3% to
  0.5% an hour, which would add more false breakouts); the daily proxy only checks the stop and take profit at the
  close; three stocks that went up a lot (survivor bias favours holding, not the rule).

Reading: not a candidate for real money. Its live result is one falling month.

## Trend filter round on alt perps: SOL, XRP, NEAR, ZEC (2026-11-14)

Owner asked for more Lab crypto agents, on perps other than BTC and ETH. One strategy family, pre-registered
(grid, split, costs and pass rule committed in `3e179e4` before the first run), `scripts/research-alt-trend.mts`,
read only. Binance spot hourly closes 2020-08 to now (HYPE and LIT are too young for a 6 year test).

- Rules (128 per coin): long when price is above its N day average (N = 7, 50, 100, 200) by a buffer (0 or 3%),
  optionally only on a breakout above the 20 day high (72 hours for N = 7); exit when the trend turns; stop none
  or 15%; size 100% or 50%; long only or long + short (mirror). Cost 0.05% a fill, longs pay 10% a year funding.
- Training 2020-10 to 2023 picks the rules, 2024 to now is the test. Pass, on at least 3 of the 4 coins: positive
  in at least 4 of 6 years (2021 to 2026), worst drop under 30%, positive on the test period.

**Result: nothing passes, nothing even survives training.** 0 of 128 rules were train-OK on 3 coins
(0 of the 32 rules with a 7 day gate, the only ones the engine can run today: rules look back at most 168 hours).

| Coin | Rules positive in 2 of 3 training years | Rules with training drop under 30% | Smallest training drop |
|---|---|---|---|
| SOL | 128 | 2 | 30% |
| XRP | 23 | 0 | 35% |
| NEAR | 124 | 3 | 25% |
| ZEC | 15 | 0 | 38% |

- **The drop limit is what fails.** Trend filters do make money on SOL and NEAR in most years, but alts fall
  60% to 95% from a peak before a 50 to 200 day average turns (for example 200 day gate, 3% buffer, 100%:
  worst drop SOL 70%, XRP 95%, NEAR 92%, ZEC 97%). Half size still leaves 46% to 84%.
- The 7 day gate (engine-ready) trades 230 to 310 times and loses to whipsaws: worst drop 61% to 88% at full size.
- XRP and ZEC are positive in only 1 of the 3 training years for most rules (2022 and 2023 chop).
- Shorts did not rescue it: no long + short rule survived either.

Reading: no new Lab perps agent on alts from this round. Holding is also not an answer (SOL -94%, NEAR -91% in
2022). If we try again, the one change worth a new pre-registered round is position size from volatility
(size = target volatility / recent volatility, so a wild coin gets a small position), since the drop limit is the
binding gate. A gate longer than 7 days would also need an engine change (Development, engine and prototype
together) before any agent could run it.

## Round 2 on alt perps: volatility sized trend filter (2026-11-14) — first rule to pass

Round 1 failed only on the drop limit, so round 2 changed one thing: position size from recent volatility
(size = min(100%, 20% or 40% target / realised 30 day volatility), resized daily when more than 25% off, or at
entry only). Same coins, split, costs and pass rule; pre-registered in `24145a9`,
`scripts/research-alt-volsize.mts`, read only. 256 rules per coin; 53 survive training; all 3 locked rules PASS.

| Locked rule (long only, 20% volatility target, daily resize) | Coins passing | Worst drop | Test 2024 to now |
|---|---|---|---|
| price above 50 day average +3% buffer, exit below it, no stop | 3 of 4 (NEAR drop 30.0%) | 20% to 30% | SOL +19%, XRP +36%, NEAR +12%, ZEC +151% |
| same with a 15% stop | 3 of 4 (identical; the stop never fires at this size) | 20% to 30% | same |
| 20 day high breakout while above the 50 day average, exit below the 10 day low | **4 of 4** | 19% to 22% | SOL +36%, XRP +62%, NEAR +13%, ZEC +128% |

By year, 50 day gate with stop (2021 / 22 / 23 / 24 / 25 / 26): SOL +91 / -9 / +50 / +13 / +4 / +2,
XRP +26 / -7 / +6 / +34 / +1 / +1, NEAR +39 / -1 / +42 / +4 / -15 / +27, ZEC +36 / -3 / -17 / +32 / +46 / +31.
Holding lost 59% to 94% in 2022; these rules lost 1% to 9%.

Checks that were not used to pick (env COINS, COST, FUNDING, SHOW):
- **Unseen coins BTC and ETH**: 50 day gate BTC +27 / -12 / +59 / +30 / +1 / +5 (drop 17%), ETH +37 / -7 / +27 /
  +13 / +22 / +6 (drop 15%); breakout BTC drop 16%, ETH drop 17%, 5 of 6 years positive. Passes there too.
- **Double cost and funding** (0.1% a fill, longs pay 20% a year): all 3 still pass, test returns 2 to 9 points lower.
- 37 of all 256 rules pass on at least 3 coins; the neighbours of the locked rules (7 day breakout, 50 day gate)
  pass too, so it is not one lucky setting. The 40% target fails the drop limit almost everywhere.

Honest limits:
- **Small returns**: the agent mostly holds cash (alts run 80% to 130% volatility, so a 20% target holds about
  15% to 25% of equity). 2025 and 2026 were near flat for SOL and XRP. It is a "lose little in crashes" rule,
  not a money printer. ZEC's +151% test is one coin's 2025 run.
- Binance spot, not Lighter perps; funding is an assumption; four coins that survived; 256 rules tried
  (mitigated by the unseen BTC/ETH check and the many passing neighbours).
- **The engine cannot run it yet**: it needs a 50 day (1,200 hour) lookback and volatility sizing with a daily
  resize. Lighter history in the database is about 134 days, enough for a 50 day average plus 30 day volatility.
  Spec for Development: notes folder `alt-volsize-spec.md`.

## Adaptive to the current market? Regime check on the crash month (2026-11-14)

Owner (via zolva-x): agents should adapt to the current crypto market. Live week: BTC -11% in 7 days, dip rules
kept buying the fall (Lab · Dip Hunter, Lab · Perps Deep Dip re-bought an hour after their stops), short rules
never fired (bounce short, spike fade: 0 trades), trend exits worked. Checked with round 2's script
(`scripts/research-alt-volsize.mts`, env SHOW, Binance closes refreshed 2026-11-14). **The last 30 days are a
report only, never a selection**: picking a rule on one crash month is how the regime matrix overfit before.

Last 30 days (hold: SOL -26%, XRP -24%, NEAR -27%, ZEC -16%, BTC -17%, ETH -19%), 20% volatility target,
daily resize, 15% stop, with the 6 year pass rule (4 of 6 years positive, worst drop under 30%):

| Rule | Last 30 days | Passes 6 year rule |
|---|---|---|
| 50 day gate, long only (approved spec) | SOL 0, XRP 0, NEAR -2, ZEC -3, BTC -2, ETH 0 | alts 3 of 4, BTC ETH 2 of 2 |
| 50 day gate, long + short | SOL **+10**, XRP **+9**, NEAR +1, ZEC -8, BTC **+6**, ETH **+9** | alts **1 of 4** (drops 30 to 33%), BTC ETH 2 of 2 |
| 7 day breakout, long only (7 day lookback fits the engine) | -5 to 0 | alts 3 of 4 (ZEC drop 38%), BTC ETH 2 of 2 (drops 8 to 10%) |
| 7 day gate, long only | -5 to -1 | alts 2 of 4 |
| 7 day gate, fixed 100% size (round 1) | n/a | 0 of 4 |

Answers to the four ideas:
1. **Regime filter: yes, but only with volatility sizing.** The same 7 day gate with a fixed size failed
   everywhere (round 1); sized by volatility, the trend rules lost 0% to 5% in the crash month while holding lost
   16% to 27%. That is the adaptation: out of the market, or small, when it falls. Shorting below the 50 day
   average made +6% to +10% this month and passes on BTC and ETH, but on alts it fails the drop limit (it gets
   squeezed in alt rallies), so: long only on alts; long + short is a candidate for BTC ETH only, and was not
   pre-registered there, so it needs its own paper holdout before anyone calls it good.
2. **"Dip in uptrend, fade in downtrend": no.** That is the "dip + fade, trend filter" rule: -88.6% on 2020-2026.
3. **Looser bounce short triggers: no.** Tuning them on this month is fitting the last 30 days; bounce short was
   -93% on 2020-2026. Zero trades in a slow grind down is the rule doing what it says.
4. **Funding as an input: untested.** Lighter funding stayed about +10.5% a year (longs pay) through the drop.
   Binance futures funding history since 2019 is free, so this can be a pre-registered round of its own.

Recommended change: none beyond the approved spec (`alt-volsize-spec.md`): trend gate plus volatility sizing.
The one new thing the engine needs for "adaptive" is volatility sizing; the 7 day breakout variant needs no
longer lookback than today (but its 30 day volatility does). Keep the existing dip and short Lab agents running
as the out-of-sample record (owner: no pause).
