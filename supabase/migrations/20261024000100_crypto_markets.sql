-- Crypto markets: ETH and BTC next to the stock tokens (research in docs/crypto-markets.md).
--
-- They are priced like stocks, from one USDG pool each, and every hourly close
-- is checked against the asset's Chainlink USD feed before it is stored.
-- stock_is_token0 keeps its name but means "the priced token is token0".
--
-- Both addresses match Chainlink's CCIP token directory for robinhood-mainnet
-- (2026-10-24), so verified_official is true for them.

alter table tokens
  add column asset_class text not null default 'stock' check (asset_class in ('stock', 'crypto')),
  add column chainlink_feed text;

insert into tokens (address, symbol, name, price_pool, pool_kind, stock_is_token0, token_decimals, verified_official, enabled, asset_class, chainlink_feed)
values
  -- WETH / USDG 0.01% Uniswap v3, about $18.7M liquidity; feed ETH / USD.
  ('0x0bd7d308f8e1639fab988df18a8011f41eacad73', 'ETH', 'Ethereum', '0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca', 'v3', true, 18, true, true, 'crypto', '0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9'),
  -- cbBTC / USDG 0.05% Uniswap v3, the busiest cbBTC pool; feed CBBTC / USD.
  ('0xcec185eb182c47d1ba1efc84e6959e18cd620be4', 'BTC', 'Bitcoin', '0x9664d869540e9d0a76f12c6623946c6d5d201e09', 'v3', false, 8, true, true, 'crypto', '0x0009cD492adf8167f9eEBf1293556A673530a21a');

-- Same document as before, plus each token's asset class.
create or replace function candle_closes(p_from timestamptz) returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(token_row order by symbol), '[]'::jsonb)
    from (
      select t.symbol,
             jsonb_build_object(
               'address', t.address,
               'symbol', t.symbol,
               'name', coalesce(t.name, t.symbol),
               'assetClass', t.asset_class,
               'candles', coalesce((
                 select jsonb_agg(jsonb_build_array(extract(epoch from c.ts)::bigint, c.close) order by c.ts)
                   from public.candles c
                  where c.token_address = t.address and c.ts >= p_from
               ), '[]'::jsonb)
             ) as token_row
        from public.tokens t
       where t.enabled
    ) rows;
$$;
