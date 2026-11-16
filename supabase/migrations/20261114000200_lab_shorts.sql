-- Lab long + short rules with a funding filter (2026-11-14, docs/perps-research.md "Round 3"): custom
-- rules on perps may also short (params.rules.shortEntry / shortExit). A volatility sized short keeps
-- its stop at the first entry price after a resize moves its entry, so positions get stop_price
-- (missing means the stop is measured from avg_entry_price, as before). Paper only.

alter table positions add column stop_price numeric;

-- Same as 20261113000300_leveraged_short, plus each position's stop_price (missing means none).
create or replace function apply_agent_hour(
  p_agent_id    uuid,
  p_ts          timestamptz,
  p_cash        numeric,
  p_equity      numeric,
  p_hold_equity numeric,
  p_decisions   jsonb,
  p_positions   jsonb,  -- [{ token_address, quantity, avg_entry_price, opened_at, side?, margin?, stop_price? }]
  p_trades      jsonb   -- [{ token_address, side, quantity, price, cost_usd, reason }]
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.agent_runs (agent_id, ts, equity, hold_equity, cash, decisions)
  values (p_agent_id, p_ts, p_equity, p_hold_equity, p_cash, p_decisions)
  on conflict (agent_id, ts) do nothing;
  if not found then
    return false;
  end if;

  insert into public.trades (agent_id, ts, token_address, side, quantity, price, cost_usd, reason)
  select p_agent_id, p_ts, t.token_address, t.side, t.quantity, t.price, t.cost_usd, t.reason
    from jsonb_to_recordset(p_trades) as t(token_address text, side text, quantity numeric, price numeric, cost_usd numeric, reason text);

  delete from public.positions where agent_id = p_agent_id;
  insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at, side, margin, stop_price)
  select p_agent_id, p.token_address, p.quantity, p.avg_entry_price, p.opened_at, coalesce(p.side, 'long'), p.margin, p.stop_price
    from jsonb_to_recordset(p_positions) as p(token_address text, quantity numeric, avg_entry_price numeric, opened_at timestamptz, side text, margin numeric, stop_price numeric);

  update public.agents set cash = p_cash, last_run_ts = p_ts where id = p_agent_id;
  return true;
end;
$$;

-- Same as 20261114000100_vol_sizing, plus: short rules only on perps.
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
