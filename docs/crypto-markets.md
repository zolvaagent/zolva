# Crypto markets (2026-10-24)

How Zolva reads prices for major crypto on Robinhood Chain. Built on 2026-10-24 with the recommended setup below:
ETH from `0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca` and BTC from `0x9664d869540e9d0a76f12c6623946c6d5d201e09`
(migration `20261024000100_crypto_markets.sql`).

## What exists on chain

| Asset | Token on Robinhood Chain | Best USDG pool (GeckoTerminal, 2026-10-24) | Chainlink feed |
|---|---|---|---|
| ETH | WETH | Uniswap v3 0.01%: $18.7M liquidity, $172M volume per day | ETH / USD `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` |
| BTC | cbBTC `0xcec185eb182c47d1ba1efc84e6959e18cd620be4` (reads "Coinbase Wrapped BTC", 8 decimals, 27.79 BTC supply) | Uniswap v4 0.15%: $732K; v3 0.05% `0x9664d869540e9d0a76f12c6623946c6d5d201e09`: $221K; cbBTC/WETH v3 0.3%: $1.0M | BTC / USD `0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251`, CBBTC / USD `0x0009cD492adf8167f9eEBf1293556A673530a21a`, WBTC / USD |
| LINK | several tokens named LINK | the largest is $48K (LINK/WETH): too thin | LINK / USD `0xe86e3422Aa9B5e8ee9f3E41a63975bC387A8bce9` |
| SOL, XRP, DOGE | only clones and memes with these names | under $15K, or fake (one "XRP/WETH" pool shows $53B liquidity) | none |

Chainlink's Robinhood Chain directory (`reference-data-directory.vercel.app/feeds-robinhood-mainnet.json`)
has 58 feeds. The crypto ones include BTC, ETH, cbBTC, WBTC, LBTC, BTC.B, wstETH, weETH, LINK, ENA and
the stablecoins. There is no SOL feed. Every crypto feed updates on a 0.5% move or every 24 hours.
On 2026-10-24 the BTC feed was last updated 10 hours earlier. The feeds are free view calls.

## Two ways to read prices

1. **The pool, like stock tokens (recommended).** The hourly close comes from the token's USDG pool,
   read by the existing on-chain reader in `lib/prices/onchain.ts`. It moves every block, and
   GeckoTerminal has history for the backfill. Weakness: a thin pool (cbBTC's is $221K to $732K) can be
   pushed for a block.
2. **Chainlink only.** The price is hard to manipulate, but it holds still until there is a 0.5% move
   or 24 hours pass. Hourly candles would sit flat for hours, which breaks RSI, z score and breakout
   rules. Not usable as the main source.

Recommended setup: take prices from the pool, and check them against Chainlink every hour. If the
two differ by more than about 2%, skip that hour for that token, using the same "missed hour"
behaviour agents already have.

## Rules this keeps

- Pick tokens by address only. The names SOL, XRP, LINK and DOGE are mostly clones here.
- The cbBTC and WETH addresses match Chainlink's CCIP token directory for robinhood-mainnet
  (checked 2026-10-24).
- Start with ETH and BTC only. Add others when a real token has a USDG pool above about $1M.

## Cost

About $0 a month. That is roughly 2 to 4 extra RPC calls per hour per token, plus free GeckoTerminal
history. Database and Worker costs do not change.

Sources: GeckoTerminal API (network `robinhood`), Chainlink reference data directory, on-chain reads
via Alchemy on 2026-10-24. docs.robinhood.com did not load from this machine (connection refused).
