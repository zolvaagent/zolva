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
