-- Vol Trend portfolio (owner 2026-11-25: "vol trend portfolio bangun di sini"; Research spec in
-- docs/perps-research.md, "Many-coin momentum portfolio"). A Lab paper agent may set params.portfolio
-- = { leverage }: every market is an equal sleeve of the account, and each position is margined at
-- leverage x its margin, longs and shorts (lib/engine/engine.ts AgentParams.portfolio). Positions
-- already store margin and stop_price for any side, so only the agent guard changes.

-- Same as 20261116000800_live_voltrend_prep.sql, plus the portfolio scope and range checks.
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
  if new.params -> 'rules' ? 'shortEntry' and (new.strategy <> 'custom' or agent_venue <> 'perps') then
    raise exception 'agents_spot_no_shorts: short rules trade perps only';
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
    if new.strategy <> 'custom' then
      raise exception 'agents_sizing_scope: only custom rules can use volatility sizing';
    end if;
    if new.params -> 'sizing' ->> 'kind' is distinct from 'volTarget'
      or (new.params -> 'sizing' ->> 'targetPct')::numeric not between 1 and 100
      or (new.params -> 'sizing' ->> 'hours')::numeric not between 24 and 1200 then
      raise exception 'agents_sizing_range: volTarget with targetPct 1 to 100 and hours 24 to 1200';
    end if;
  end if;
  if new.params ? 'portfolio' then
    if new.strategy <> 'custom' or agent_venue <> 'perps' or not (new.params ? 'sizing') or new.mode <> 'paper' then
      raise exception 'agents_portfolio_scope: a portfolio is custom rules with volatility sizing on perps, paper only';
    end if;
    if (new.params -> 'portfolio' ->> 'leverage')::numeric is null
      or (new.params -> 'portfolio' ->> 'leverage')::numeric not between 1 and 3 then
      raise exception 'agents_portfolio_range: portfolio leverage must be between 1 and 3';
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
