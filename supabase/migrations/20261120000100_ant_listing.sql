-- $ANT: Anthropic, PBC Class A Common Stock • Robinhood Token (Anthropic IPO, Nasdaq 2026-11-19).
-- Robinhood deployed it before the IPO under the placeholder name "PEACH_DEFI_1" and renamed it after the
-- listing. Checked with `npm run check:token` on 2026-11-20: same bytecode and beacon as the official
-- Stock Tokens, " • Robinhood Token" name, 18 decimals. Address confirmed by the owner.
-- Price pool: the Uniswap v3 0.3% USDG pool (created 2026-11-19 17:16 UTC). A deeper v4 pool exists but
-- charges 4.99%, which lets its price drift up to ~5% from fair value. USDG is token0 here.
insert into tokens (address, symbol, name, price_pool, pool_kind, stock_is_token0, token_decimals, verified_official, enabled, asset_class, history_start)
values (
  '0xbbb6c29bcc3a1028a2b54310df73f4f7a3bcb373',
  'ANT',
  'Anthropic, PBC Class A Common Stock • Robinhood Token',
  '0x0ff3e9a6114a1c1e7a6490a5d9bc250990046400',
  'v3',
  false,
  18,
  true,
  true,
  'stock',
  '2026-11-19T18:00:00Z'
)
on conflict (address) do nothing;
