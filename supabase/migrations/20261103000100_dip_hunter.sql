-- Dip hunter (docs/down-market-research.md): a preset that watches many markets and
-- holds one at a time. It is the only strategy allowed more than 3 markets (up to 20);
-- every other agent keeps the 1 to 3 limit.
alter table agents drop constraint agents_strategy_check;
alter table agents add constraint agents_strategy_check check (strategy in ('momentum', 'mean_reversion', 'dip_hunter', 'custom'));

alter table agents drop constraint agents_token_addresses_check;
alter table agents add constraint agents_token_addresses_check check (
  cardinality(token_addresses) >= 1
  and cardinality(token_addresses) <= case when strategy = 'dip_hunter' then 20 else 3 end
);
