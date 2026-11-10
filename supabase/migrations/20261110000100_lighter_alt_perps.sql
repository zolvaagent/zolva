-- Five more crypto perps on Lighter (Robinhood Chain), paper only, for a second Lab agent
-- on the deep dip rule (docs/perps-research.md, "The deep dip rule on other perps").
-- Added disabled; enabled once their history is backfilled.

-- Perps agents (Lab only; users cannot create them) may watch up to 10 markets.
alter table agents drop constraint agents_token_addresses_check;
alter table agents add constraint agents_token_addresses_check check (
  cardinality(token_addresses) >= 1
  and cardinality(token_addresses) <= case
    when strategy = 'dip_hunter' then 20
    when params ->> 'venue' = 'perps' then 10
    else 3
  end
);

insert into tokens (address, symbol, name, price_pool, pool_kind, stock_is_token0, token_decimals, verified_official, enabled, asset_class, venue, lighter_market_id)
values
  ('lighter:2', 'HYPE-PERP', 'Hyperliquid perp (Lighter)', 'lighter:2', 'lighter', true, 18, false, false, 'crypto', 'lighter', 2),
  ('lighter:4', 'ZEC-PERP', 'Zcash perp (Lighter)', 'lighter:4', 'lighter', true, 18, false, false, 'crypto', 'lighter', 4),
  ('lighter:5', 'LIT-PERP', 'Lighter perp (Lighter)', 'lighter:5', 'lighter', true, 18, false, false, 'crypto', 'lighter', 5),
  ('lighter:6', 'XRP-PERP', 'XRP perp (Lighter)', 'lighter:6', 'lighter', true, 18, false, false, 'crypto', 'lighter', 6),
  ('lighter:7', 'NEAR-PERP', 'NEAR perp (Lighter)', 'lighter:7', 'lighter', true, 18, false, false, 'crypto', 'lighter', 7);
