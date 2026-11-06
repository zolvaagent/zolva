# Scalping research (2026-11-06)

Question from the owner: crypto trades around the clock, so can a Zolva agent scalp ETH or
BTC (many short trades, minutes long) instead of trading once an hour? Research only,
nothing built.

## Costs on Robinhood Chain (read on chain 2026-11-06)

| Pool | Fee tier | USDG in the pool | Round trip at $100 | Round trip at $1,000 |
|---|---|---|---|---|
| ETH/USDG | 0.01% | about $2.1M | about 5 bps | about 4 bps |
| BTC/USDG | 0.05% | about $12.8k | about 13 bps | about 12 bps (and real price impact) |

Round trip = fee twice, 0.01% slippage a side, $0.005 gas a swap. At $10 a trade the gas
alone is about 10 bps, so scalping only makes sense from about $100 a trade, on ETH.
The paper engine's flat 0.5% a trade (100 bps a round trip) would sink any scalping rule,
so a scalping agent would need per market costs.

## Data

`scripts/research-scalp-data.mts`: the pool price (slot0) at a historical block once a
minute, 14 days, ETH and BTC, 20,160 minutes each, no gaps. Both fell about 7% over the
14 days.

## Backtest

`scripts/research-scalp.mts`: one position at a time, long and short, 54 settings across
two rule families:

- **Reversion:** z of the price against its last 15, 30 or 60 minutes; in at |z| 2, 2.5 or
  3, out when z is back to 0, at the stop, or after the max hold.
- **Breakout:** above the last 15/30/60 minute high (long) or below the low (short); out at
  the stop, the target or the max hold.

To avoid fooling ourselves, the first 7 days pick the best settings and the last 7 days
check them.

| | ETH, $100 trades | ETH, $1,000 | BTC, $100 | BTC, $1,000 |
|---|---|---|---|---|
| Best setting, first half | +7.5% | +8.4% | +2.5% | +2.7% |
| Same setting, second half | **-5.3%** | **-4.4%** | **-1.2%** | **-1.0%** |
| Settings positive in the second half | 12 of 54 | 12 of 54 | 0 of 54 | 0 of 54 |

Every top 4 setting from the first week lost money in the second week, with win rates
falling to 35 to 43%. The few that turned positive in the second week had lost in the
first. Reversion rules never made the top 5. That is what noise looks like: no rule
holds up from one week to the next once costs are paid.

## Conclusion

No scalping edge on ETH or BTC in this data, even at the cheapest real cost (ETH pool,
$1,000 trades). Building a minute engine, minute candles and a scalping agent would cost
real work for a strategy that loses after fees. Not recommended now.

Worth a re-test only with something new to test: more data (a rising market, say a
month from now), a different signal (order flow from the Swap events, funding on a perps
venue), or cheaper execution.
