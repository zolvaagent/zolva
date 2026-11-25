-- Cached market prices for pages (owner 2026-11-25: "Ya, lanjutkan"). candle_closes builds every token's
-- hourly closes as JSON (~290 ms) and pages called it ~100k times (getMarket only cached per Worker isolate
-- for 5 minutes). candle_closes_cached returns a stored result while the candles have not changed.
--
-- A stored result is used only when both hold:
--   1. No candle was written since it was built: any insert, update or delete on candles empties the cache
--      (one statement-level trigger, so an hourly ingest of ~40 rows clears it once).
--   2. Its newest candle hour still equals the newest hour in candles, which covers a result built from a
--      snapshot taken just before an ingest committed.
-- The hourly agent runners and Verify keep calling candle_closes directly (getMarket { fresh: true } and
-- lib/data/verify.ts), so agent decisions and replays never read a cached result.

create table market_price_cache (
  p_from      timestamptz primary key,
  latest_ts   timestamptz not null,
  data        jsonb not null,
  built_at    timestamptz not null default now()
);
alter table market_price_cache enable row level security;

create function market_price_cache_clear() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.market_price_cache;
  return null;
end;
$$;

create trigger candles_clear_market_cache
after insert or update or delete on candles
for each statement execute function market_price_cache_clear();

create function candle_closes_cached(p_from timestamptz) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  newest timestamptz := (select max(ts) from public.candles);
  hit jsonb;
  built jsonb;
begin
  select data into hit from public.market_price_cache where p_from = candle_closes_cached.p_from and latest_ts = newest;
  if hit is not null then
    return hit;
  end if;
  built := public.candle_closes(p_from);
  insert into public.market_price_cache (p_from, latest_ts, data)
  values (p_from, newest, built)
  on conflict (p_from) do update set latest_ts = excluded.latest_ts, data = excluded.data, built_at = now();
  return built;
end;
$$;

revoke all on function candle_closes_cached(timestamptz) from public, anon, authenticated;
grant execute on function candle_closes_cached(timestamptz) to service_role;
revoke all on function market_price_cache_clear() from public, anon, authenticated;
