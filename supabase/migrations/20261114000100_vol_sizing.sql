-- Volatility sizing (2026-11-14, docs/perps-research.md "Round 2 on alt perps"): a custom rules agent
-- on perps may size each buy by volatility (params.sizing = { kind: 'volTarget', targetPct, hours })
-- and resize its open position once a day. A resize is stored as a trade with reason 'resize'.
-- Paper only, like every perps agent.

alter table trades drop constraint trades_reason_check;
alter table trades add constraint trades_reason_check check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold', 'manual', 'resize'));

-- Same as 20261113000300_leveraged_short, plus: sizing only for custom rules on perps, within range.
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
  if new.params ? 'leverage' then
    if new.strategy <> 'bounce_short' or agent_venue <> 'perps' then
      raise exception 'agents_leverage_scope: only a bounce short on perps can use leverage';
    end if;
    if (new.params ->> 'leverage')::numeric < 1 or (new.params ->> 'leverage')::numeric > 10 then
      raise exception 'agents_leverage_range: leverage must be between 1 and 10';
    end if;
  end if;
  if new.params ? 'sizing' then
    if new.strategy <> 'custom' or agent_venue <> 'perps' then
      raise exception 'agents_sizing_scope: only custom rules on perps can use volatility sizing';
    end if;
    if new.params -> 'sizing' ->> 'kind' is distinct from 'volTarget'
      or (new.params -> 'sizing' ->> 'targetPct')::numeric not between 1 and 100
      or (new.params -> 'sizing' ->> 'hours')::numeric not between 24 and 1200 then
      raise exception 'agents_sizing_range: volTarget with targetPct 1 to 100 and hours 24 to 1200';
    end if;
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
