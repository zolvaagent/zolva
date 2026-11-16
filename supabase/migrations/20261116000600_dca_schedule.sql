-- DCA as a mode of the swap card (owner approved 2026-11-16, Jupiter style "Every N hours/days/weeks,
-- over N orders"): any whole number of hours between buys, 1 hour to 30 days (1 to 720), instead of only
-- daily or weekly. Agents decide once an hour, so an hour is the shortest step. Same as 20261116000500_dca_live.sql otherwise ($1 per buy per market, no perps, no AI).

alter table agents drop constraint agents_dca_plan;
alter table agents add constraint agents_dca_plan check (
  strategy <> 'dca'
  or coalesce(
    coalesce(params->>'venue', 'uniswap') <> 'perps'
    and ai_model is null
    and jsonb_typeof(params->'dca') = 'object'
    and (params->'dca'->>'buys')::integer between 2 and 104
    and (params->'dca'->>'everyHours')::integer between 1 and 720
    and (params->'dca'->>'startTs')::bigint % 3600 = 0
    and start_capital / (params->'dca'->>'buys')::integer / cardinality(token_addresses) >= 1,
    false
  )
);
