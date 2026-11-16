-- DCA preset (dollar cost averaging): equal buys on a schedule, never sells.
-- The engine reads params.dca = { buys, everyHours, startTs } (lib/engine/engine.ts dcaHour).
-- For now DCA is paper, spot and without the AI co-pilot: each small live buy would pay gas, and
-- there are no rule signals for the co-pilot to review.

alter table agents drop constraint agents_strategy_check;
alter table agents add constraint agents_strategy_check
  check (strategy in ('momentum', 'mean_reversion', 'dip_hunter', 'spike_fade', 'dip_fade', 'bounce_short', 'dca', 'custom'));

-- coalesce: a missing plan makes the test null, and a null CHECK would pass.
alter table agents add constraint agents_dca_plan check (
  strategy <> 'dca'
  or coalesce(
    mode = 'paper'
    and coalesce(params->>'venue', 'uniswap') <> 'perps'
    and ai_model is null
    and jsonb_typeof(params->'dca') = 'object'
    and (params->'dca'->>'buys')::integer between 2 and 104
    and (params->'dca'->>'everyHours')::integer in (24, 168)
    and (params->'dca'->>'startTs')::bigint % 3600 = 0,
    false
  )
);
