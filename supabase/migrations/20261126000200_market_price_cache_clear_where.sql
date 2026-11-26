-- Fix for 20261125000400: the candles trigger emptied market_price_cache with a DELETE that had no WHERE
-- clause. The database refuses that ("DELETE requires a WHERE clause"), and because the trigger runs inside
-- every candle write, no candle could be stored from 2026-11-25 08:00 UTC on (every hourly tick failed).
-- `where true` keeps the same meaning: empty the whole cache.
create or replace function public.market_price_cache_clear() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.market_price_cache where true;
  return null;
end;
$$;
