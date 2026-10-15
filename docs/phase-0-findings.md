# Phase 0: Data check (2026-10-15)

Question: can we get live prices and hourly history for Robinhood Chain stock tokens, for free, good enough to run and backtest trading agents?

**Answer: yes, through GeckoTerminal.** Two items stay open (see "Open before launch").

## Sources tested

| Source | Result | Notes |
|---|---|---|
| GeckoTerminal API (`network = robinhood`) | ✅ Works | Live price, 24h stats, hourly OHLCV. Free, no key |
| Robinhood Stock Token API (`api.robinhood.com/rhj/...`) | ⚠️ Host reachable, endpoints unknown | Docs site would not load from this machine. REST `/prices` reportedly returns raw underlying bid/ask, not multiplier-adjusted |
| Chainlink feeds on-chain | ❌ Not tested | `rpc.mainnet.chain.robinhood.com` times out from this PC. Should work from a Cloudflare Worker |

### Endpoints we will use

```text
# Live prices, up to 30 pools per call (all our tokens in one request)
GET https://api.geckoterminal.com/api/v2/networks/robinhood/pools/multi/{pool1,pool2,...}

# Hourly candles, max 1000 per call, page back with before_timestamp
GET https://api.geckoterminal.com/api/v2/networks/robinhood/pools/{pool}/ohlcv/hour?limit=1000&currency=usd&before_timestamp={unix}
```

Candle format: `[unixSeconds, open, high, low, close, volumeUsd]`, newest first.

## What we found

1. **20 stock tokens with liquid pools.** META, NVDA, SPY, USO, CRCL, GLD, MSTR, SPCX, QQQ, AMC, BABA, RDDT, TSLA, GOOGL, PLTR, AMZN, AAPL, MU, TSM, GME. Full list with contract and pool addresses: [`data/stock-tokens.json`](../data/stock-tokens.json).
2. **History depth: about 3 months.** It starts when each pool was created. META has hourly candles from 2026-07-16; BABA only from 2026-10-14. Candles were complete, with 1 missing hour in 1000.
   - A 30-day backtest is safe for most tokens.
   - The Forge must hide or warn on tokens with less history than the backtest window.
3. **Prices move 24/7, weekends included.** These are DEX prices, so they don't freeze when the stock market closes. META average absolute hourly move:
   - US market hours (14:00–20:00 UTC, Mon–Fri): 0.58%
   - Off-hours on weekdays: 0.49%
   - Weekends: 0.36%

   Agents can run around the clock, but off-hours moves are DEX drift or premium, not the real stock. The UI should label this.
4. **Copycat tokens exist.** `equity-router` tests found a fake NVDA with the exact same name (`0x1076f47f9632D726cF0FF93Ad1616C45Cbb8B94D`). Never pick tokens by name; use a fixed address allowlist.
5. **Several pools per token** (Uniswap v3 and v4, different fee tiers). We price each token from one chosen pool: the deepest one at snapshot time, stored as `pricePool`.

## Open before launch

- [ ] **Verify all 20 addresses against Robinhood's official Stock Token list** and set `verifiedOfficial: true`. Drop any token that doesn't match.
- [ ] **GeckoTerminal terms and limits.** The free tier is rate-limited and may not allow commercial use. Options at launch:
  - paid CoinGecko API, or
  - read prices on-chain (Chainlink or pool state) from the Worker.
- [ ] Re-check `pricePool` choices before launch; liquidity moves between pools.

## Target users and regions (decided)

- **Primary:** non-US, crypto-native retail who want exposure to US stocks without coding. Southeast Asia (incl. Indonesia), Latin America, EU, Africa.
- **Secondary:** crypto Twitter creators who share agents and leaderboards (distribution).
- **Excluded:** US persons; Stock Tokens are barred under Regulation S. Probably also UK, Canada, Switzerland, UAE; sources disagree, so confirm with Robinhood's restricted list.
- **From day one:** geo-block at sign-in using Cloudflare's country header, plus a terms checkbox, even during paper trading.
