-- $TTEQ: T. Rowe Price Technology ETF • Robinhood Token, the first Stock Token for an actively managed
-- ETF on Robinhood Chain (@RobinhoodCrypto, 2026-11-23). Checked with `npm run check:token` on
-- 2026-11-24: same bytecode and beacon as the official Stock Tokens, " • Robinhood Token" name,
-- 18 decimals, and the only token named TTEQ on GeckoTerminal. Address confirmed by the owner.
-- Price pool: the Uniswap v3 0.05% USDG pool (created 2026-11-23 09:28 UTC, ~$220k liquidity); the
-- other USDG pools charge 4.9% to 15% and are nearly empty. USDG is token0 here. Listed as a stock:
-- there is no separate ETF asset class.
insert into tokens (address, symbol, name, price_pool, pool_kind, stock_is_token0, token_decimals, verified_official, enabled, asset_class, history_start)
values (
  '0x80e10255a83b257f5a8674d363f547842aa53b8e',
  'TTEQ',
  'T. Rowe Price Exchange-Traded Funds, Inc. T. Rowe Price Technology ETF • Robinhood Token',
  '0x59848647aff854d7ea97a9ff955653da178e8677',
  'v3',
  false,
  18,
  true,
  true,
  'stock',
  '2026-11-23T10:00:00Z'
)
on conflict (address) do nothing;
