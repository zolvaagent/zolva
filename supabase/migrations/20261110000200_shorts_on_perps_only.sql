-- Spot is long only; shorts live on perps (2026-11-10). On spot a short has to borrow the
-- token first (margin), which Zolva only simulated; on Lighter perps a short is native.
-- New or changed agents with the short strategy (spike_fade) must trade perps. The old spot
-- Lab · Crypto Spike Fade is paused and keeps its record.

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
  if new.strategy = 'spike_fade' and agent_venue <> 'perps' then
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

-- The trigger also fires on a strategy change now.
drop trigger agents_venue_guard on agents;
create trigger agents_venue_guard
  before insert or update of params, token_addresses, mode, strategy on agents
  for each row execute function agent_venue_guard();
