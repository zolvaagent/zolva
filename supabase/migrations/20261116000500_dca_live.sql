-- DCA with real money (owner approved 2026-11-16, "Recurring buy" on /swap): a live DCA agent buys on
-- its schedule from the owner's own wallet through the existing live executor (Zolva's signer under the
-- wallet's policy, the live capital cap, daily volume cap and one live agent per wallet all still apply).
-- Same as agents_dca_plan in 20261116000300_dca.sql, without "paper only", plus: every scheduled buy is at
-- least $1 per market (start capital / buys / markets), so a buy is never too small to be worth its gas.

alter table agents drop constraint agents_dca_plan;
alter table agents add constraint agents_dca_plan check (
  strategy <> 'dca'
  or coalesce(
    coalesce(params->>'venue', 'uniswap') <> 'perps'
    and ai_model is null
    and jsonb_typeof(params->'dca') = 'object'
    and (params->'dca'->>'buys')::integer between 2 and 104
    and (params->'dca'->>'everyHours')::integer in (24, 168)
    and (params->'dca'->>'startTs')::bigint % 3600 = 0
    and start_capital / (params->'dca'->>'buys')::integer / cardinality(token_addresses) >= 1,
    false
  )
);
