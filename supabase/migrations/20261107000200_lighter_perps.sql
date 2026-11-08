-- Perps on Lighter (Robinhood Chain), paper only: docs/perps-plan.md Phase 2,
-- docs/perps-research.md.
--
-- A perp is a market like any token, with venue 'lighter': id 'lighter:<market id>', a
-- symbol ending in -PERP, hourly candles and funding from Lighter's public API. Agents
-- trade either DEX tokens or perps, never both, and never perps with real money.

alter table tokens
  add column venue text not null default 'uniswap' check (venue in ('uniswap', 'lighter')),
  add column lighter_market_id integer unique;

alter table tokens drop constraint tokens_address_check;
alter table tokens add constraint tokens_address_check check (
  (venue = 'uniswap' and address = lower(address) and address ~ '^0x[0-9a-f]{40}$')
  or (venue = 'lighter' and lighter_market_id is not null and address = 'lighter:' || lighter_market_id)
);
alter table tokens drop constraint tokens_pool_kind_check;
alter table tokens add constraint tokens_pool_kind_check check (pool_kind in ('v3', 'v4', 'lighter'));
-- The venue shows in the symbol (the app links markets by symbol), and pool kind follows the venue.
alter table tokens add constraint tokens_venue_shape check (
  (venue = 'lighter') = (pool_kind = 'lighter')
  and (venue = 'lighter') = (symbol like '%-PERP')
);

-- Funding for the hour that starts at ts, as a signed fraction (positive: longs pay shorts).
alter table candles add column funding_rate numeric;
alter table candles drop constraint candles_source_check;
alter table candles add constraint candles_source_check check (source in ('ohlcv', 'snapshot', 'onchain', 'lighter'));

-- Added disabled: code deployed before this migration would read them as DEX pools. They
-- are enabled (update tokens set enabled = true where venue = 'lighter') once the code that
-- knows the venue is live.
insert into tokens (address, symbol, name, price_pool, pool_kind, stock_is_token0, token_decimals, verified_official, enabled, asset_class, venue, lighter_market_id)
values
  ('lighter:1', 'BTC-PERP', 'Bitcoin perp (Lighter)', 'lighter:1', 'lighter', true, 18, false, false, 'crypto', 'lighter', 1),
  ('lighter:0', 'ETH-PERP', 'Ether perp (Lighter)', 'lighter:0', 'lighter', true, 18, false, false, 'crypto', 'lighter', 0),
  ('lighter:3', 'SOL-PERP', 'Solana perp (Lighter)', 'lighter:3', 'lighter', true, 18, false, false, 'crypto', 'lighter', 3);

-- An agent's venue (params.venue, 'dex' when missing) must match every one of its markets,
-- and perps stay paper only.
create function agent_venue_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  agent_venue text := coalesce(new.params ->> 'venue', 'dex');
begin
  if agent_venue not in ('dex', 'perps') then
    raise exception 'agent_venue_invalid: %', agent_venue;
  end if;
  if agent_venue = 'perps' and new.mode = 'live' then
    raise exception 'agents_live_no_perps: perps agents are paper only';
  end if;
  if exists (
    select 1
      from unnest(new.token_addresses) as chosen(address)
      left join public.tokens t on t.address = chosen.address
     where coalesce(t.venue, '') <> case agent_venue when 'perps' then 'lighter' else 'uniswap' end
  ) then
    raise exception 'agent_venue_mismatch: a % agent can only trade % markets', agent_venue, case agent_venue when 'perps' then 'Lighter perps' else 'DEX' end;
  end if;
  return new;
end;
$$;

create trigger agents_venue_guard
  before insert or update of params, token_addresses, mode on agents
  for each row execute function agent_venue_guard();

-- Closes for the app now carry the venue, and perps also carry each hour's funding.
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
               'venue', t.venue,
               'candles', coalesce((
                 select jsonb_agg(
                          case when t.venue = 'lighter'
                               then jsonb_build_array(extract(epoch from c.ts)::bigint, c.close, c.funding_rate)
                               else jsonb_build_array(extract(epoch from c.ts)::bigint, c.close)
                          end
                          order by c.ts)
                   from public.candles c
                  where c.token_address = t.address and c.ts >= p_from
               ), '[]'::jsonb)
             ) as token_row
        from public.tokens t
       where t.enabled
    ) rows;
$$;
