-- Bounce short (2026-11-13, scripts/research-short-trend.mts): short only, one position at a
-- time, on the market with the deepest 7 day fall once it bounces, unless it already rose more
-- than 1.5% in 24 hours. It shorts, so like spike fade and dip fade it is paper only and must
-- trade perps.

alter table agents drop constraint agents_strategy_check;
alter table agents add constraint agents_strategy_check
  check (strategy in ('momentum', 'mean_reversion', 'dip_hunter', 'spike_fade', 'dip_fade', 'bounce_short', 'custom'));

alter table agents drop constraint agents_live_no_shorts;
alter table agents add constraint agents_live_no_shorts check (mode = 'paper' or strategy not in ('spike_fade', 'dip_fade', 'bounce_short'));

-- Same as 20261111000200_dip_fade, with bounce_short next to the other short strategies.
create or replace function agent_venue_guard() returns trigger
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
  if new.strategy in ('spike_fade', 'dip_fade', 'bounce_short') and agent_venue <> 'perps' then
    raise exception 'agents_spot_no_shorts: spot is long only; shorts trade perps';
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
