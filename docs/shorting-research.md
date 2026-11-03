# Shorting research (2026-11-03)

Question: how could a Zolva agent profit from a falling price (go short)? Research only,
nothing built.

## Two ways to short on Robinhood Chain

### 1. Borrow and sell on Morpho (on chain, recommended to test first)

Morpho Blue runs on Robinhood Chain (chain 4663). Most markets lend USDG against stock
tokens, but some do the reverse: lend a **stock token** against **steakUSDG** (Steakhouse's
USDG vault share) as collateral. A short is:

1. Deposit USDG into the steakUSDG vault, supply the shares as collateral.
2. Borrow the stock token, sell it for USDG on Uniswap (what live agents already do).
3. To close: buy the token back, repay the loan, withdraw the collateral.

Markets with a stock token as the loan asset and real liquidity, from Morpho's public API
(`blue-api.morpho.org`, 532 markets on chain 4663, 2026-11-03). Every address below was
checked against `data/stock-tokens.json`:

| Borrow | Collateral | Max LTV | Supplied | Available | Borrow APY now |
|---|---|---|---|---|---|
| NVDA | steakUSDG | 63% | $18,090 | $17,366 | ~0% |
| SPY | steakUSDG | 77% | $1,515 | $1,515 | ~0% |
| SPCX | steakUSDG | 63% | $1,306 | $1,306 | ~0% |
| MSTR | steakUSDG | 63% | $1,087 | $1,087 | ~0% |
| QQQ | steakUSDG | 77% | $893 | $891 | ~0% |
| TSLA | steakUSDG | 63% | $595 | $595 | ~0% |
| GME | steakUSDG | 63% | $396 | $396 | ~0% |
| PLTR | steakUSDG | 63% | $386 | $386 | ~0% |

(COIN also has $441, but it is not on our allowlist; a SPCX market against ORBIT is fully
borrowed at an extreme rate and is not usable.)

- **Good:** same chain, same Uniswap pools, signed by the same Privy signer (the policy
  would need Morpho and the vault added). No leverage needed: shorting $5 against $10 of
  collateral is liquidated only if the stock rises about 26%, so a stop loss closes first.
- **Limits:** small. Fine for a $10 to $100 agent, not for many users. Rates sit near zero
  because nobody borrows; Morpho's rate rises fast when a market is mostly borrowed.
- **Not yet checked:** the steakUSDG deposit and withdraw path and its fees, the oracle each
  market uses (and its pause during corporate actions), gas for the 4 to 6 transactions a
  short needs.

### 2. Perpetual futures (perps)

- **Lighter:** named as Robinhood Chain's perps partner and the perps venue inside Robinhood
  Wallet. A separate exchange: funds are deposited there and orders go through its API, so
  the Privy policy and executor would not cover it.
- **Arcus** (dYdX Labs and Robinhood Crypto): spot is live, perps (35 markets, up to 50x)
  were on a waitlist at launch.
- **Perpetra, Meridian** (RWA perps settled in USDe): smaller, not checked.

Perps give real leverage and deep shorts but add funding costs, liquidation within an hour,
custody on another venue, and stricter rules for leveraged derivatives.

## Recommendation

1. **Backtest first (free):** add short signals to the research script (for example, short
   a market that breaks below its average, cover on the bounce) with a borrow cost, and see
   whether shorting would have paid in the last 30 and 60 days.
2. **If it pays:** one small manual Morpho short with real money ($5, owner wallet) to
   measure every step's cost and confirm the path.
3. **Then:** short positions in the engine (`runHour`, prototype parity), the executor and
   the Privy policy; paper first, then live.

Perps only if Morpho's liquidity becomes the limit.

## Backtest of short signals (2026-11-03)

`scripts/research-shorting.mts` (read-only). The 8 borrowable markets, 10% stop, borrow
at 10% a year (cautious; Morpho was near 0%), one position per side. Return on the
agent, at 0.3% cost per trade (close to real fills):

| Window | Holding | Trend short | Spike fade | Dip long + spike fade short |
|---|---|---|---|---|
| Last 30d (falling) | -8.2% | -4.5% | -10.5% | -7.6% |
| 30d before (rising) | +7.7% | -25.8% | +1.5% | -5.0% |
| Last 60d | -1.0% | -29.2% | -9.2% | -12.2% |

At 0.5% cost every result is 4 to 9 points worse. The profit math was checked by hand
(a 10% fall gains about 9.4% on the short after costs).

**Conclusion: shorting would not have paid.** No short signal made money in the falling
month; the trend short only lost less than holding (-4.5% vs -8.2%) and lost badly once
prices rose. These markets reverse fast: by the time a fall is clear enough to short, the
bounce is near, which is why buying dips (the dip hunter) worked better than shorting.
Not building shorting now; re-test when there is more history or a market that trends
down for weeks.

## Crypto (2026-11-03)

**Where:** on chain, almost nowhere. Morpho lends only about $50 to $60 of WETH (against
USDG or vault shares) and no BTC. Crypto shorts would have to go through perps (Lighter,
Arcus), off the executor's path.

**Backtest** (`SHORT_MARKETS=ETH,BTC`; BTC has 52 days of history, so the older windows
are ETH only), 10% a year borrow or funding, 10% stop:

| Window | Holding | Trend short | Spike fade | Dip long + spike fade short |
|---|---|---|---|---|
| Last 30d, 0.1% cost | -13.2% | -5.3% | **+3.3%** | -1.1% |
| 30d before, 0.1% | +7.3% | -2.6% | **+10.9%** | +8.7% |
| Last 60d, 0.1% | -10.4% | -7.8% | **+14.2%** | +7.7% |
| Last 30d, 0.3% cost | -13.4% | -7.5% | +1.3% | -3.1% |
| 30d before, 0.3% | +7.1% | -3.4% | +7.9% | +6.1% |
| Last 60d, 0.3% | -10.5% | -10.7% | +9.4% | +3.3% |

**Spike fade on crypto was positive in every window**, falling or rising, unlike on
stocks. But it rests on 5 to 11 shorts per window, mostly ETH alone: too few to trust.
Trend shorts lost here too.

### ETH and BTC together, last 45 days (2026-11-03)

BTC's full history (52 days, 7 for warm-up), `WINDOWS=45:0,15:0,15:15,15:30`:

| Window | Holding | Spike fade, 0.1% cost | Spike fade, 0.3% cost | Trend short, 0.1% |
|---|---|---|---|---|
| 45 days | -10.0% | **+7.5%** | +3.8% | -6.6% |
| Last 15 days | -7.2% | +1.4% | +0.6% | -1.5% |
| 15 days before | -6.3% | +0.5% | -0.5% | -3.8% |
| 15 days before that (rising) | +3.5% | +4.1% | +2.4% | -1.4% |

Spike fade stayed positive in every piece at perps-like cost (0.1%), worst drop about 5%,
but opened only 9 shorts in 45 days. Consistent so far, still a small sample. Longer
history (Ethereum or Arbitrum Chainlink feeds) needs those networks enabled in Alchemy;
CoinGecko's free hourly data covers only 90 days.
