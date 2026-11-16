-- Open interest on Lighter perps, for the Lab open interest gate (oiChange, docs/perps-research.md "Round 4").
-- Lighter keeps no open interest history, so the hourly ingest stores the current value (in coins) on the
-- newest complete hour's candle; the gate works once 168 stored hours exist.
-- candle_closes returns it as a 4th element of perps candles: [ts, close, funding_rate, open_interest].

alter table candles add column open_interest numeric;

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
                               then jsonb_build_array(extract(epoch from c.ts)::bigint, c.close, c.funding_rate, c.open_interest)
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
