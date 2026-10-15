-- Where a candle came from.
--   ohlcv:    a full hourly candle from GeckoTerminal (backfill and repair).
--   snapshot: the live price read once at tick time, stored as open = high =
--             low = close for the hour that just ended. A later repair
--             replaces it with the real candle.
-- The free GeckoTerminal tier cannot serve one OHLCV call per token per hour
-- (about half the calls were rate limited), so the hourly tick takes one
-- multi-pool price snapshot and repairs a few tokens per hour in rotation.

alter table candles
  add column source text not null default 'ohlcv' check (source in ('ohlcv', 'snapshot'));
