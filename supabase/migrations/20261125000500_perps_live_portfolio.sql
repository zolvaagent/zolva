-- Real-money Vol Trend Portfolio on Lighter (owner 2026-11-25: "Ya, bangun pakai Lighter"; Research's
-- safety list in docs/tasks.md). Applied after 20261115000100_perps_live.sql, which adds the Lighter
-- columns and functions. This file sets the final agent guard (the perps_live rules plus the portfolio
-- rules of 20261125000200, with live portfolios at most 2x and only on a Lighter account) and lets
-- sync_lighter_agent keep a portfolio position's margin (derived from Lighter: size x entry / leverage).

-- Same as 20261115000100_perps_live.sql, plus the portfolio checks.
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
  if agent_venue = 'perps' and new.mode = 'live' and new.lighter_account_index is null then
    raise exception 'agents_live_no_perps: perps agents are paper only unless Zolva assigned a Lighter account';
  end if;
  if new.lighter_account_index is not null and (agent_venue <> 'perps' or new.mode <> 'live') then
    raise exception 'agents_lighter_scope: a Lighter account is only for live perps agents';
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
    -- Real money stays at 1x until the leverage research gate (plan section 2) says otherwise.
    if new.mode = 'live' and (new.params ->> 'leverage')::numeric > 1 then
      raise exception 'agents_live_leverage: live perps agents trade at 1x';
    end if;
  end if;
  if new.params ? 'sizing' then
    -- Spot sizing is allowed since 20261116000800_live_voltrend_prep.sql; this file is applied after it.
    if new.strategy <> 'custom' then
      raise exception 'agents_sizing_scope: only custom rules can use volatility sizing';
    end if;
    if new.params -> 'sizing' ->> 'kind' is distinct from 'volTarget'
      or (new.params -> 'sizing' ->> 'targetPct')::numeric not between 1 and 100
      or (new.params -> 'sizing' ->> 'hours')::numeric not between 24 and 1200 then
      raise exception 'agents_sizing_range: volTarget with targetPct 1 to 100 and hours 24 to 1200';
    end if;
  end if;
  -- Lab portfolio (equal sleeves at account leverage): custom rules with volatility sizing on perps.
  -- Paper at 1 to 3x; live only on a Lighter account Zolva assigned, and at most 2x (Research's hard limit).
  if new.params ? 'portfolio' then
    if new.strategy <> 'custom' or agent_venue <> 'perps' or not (new.params ? 'sizing') then
      raise exception 'agents_portfolio_scope: a portfolio is custom rules with volatility sizing on perps';
    end if;
    if new.mode = 'live' and new.lighter_account_index is null then
      raise exception 'agents_portfolio_scope: a live portfolio needs a Lighter account';
    end if;
    if (new.params -> 'portfolio' ->> 'leverage')::numeric is null
      or (new.params -> 'portfolio' ->> 'leverage')::numeric not between 1 and (case when new.mode = 'live' then 2 else 3 end) then
      raise exception 'agents_portfolio_range: portfolio leverage must be between 1 and 3 (live: at most 2)';
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

-- Same as 20261115000100_perps_live.sql, except the margin is stored (null for 1x agents).
create or replace function sync_lighter_agent(p_agent_id uuid, p_cash numeric, p_positions jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.agents where id = p_agent_id and lighter_account_index is not null) then
    raise exception 'sync_lighter_agent: % is not a Lighter agent', p_agent_id;
  end if;
  delete from public.positions where agent_id = p_agent_id;
  insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at, side, margin, stop_price)
  select p_agent_id, p.token_address, p.quantity, p.avg_entry_price, p.opened_at, coalesce(p.side, 'long'), p.margin, p.stop_price
    from jsonb_to_recordset(p_positions) as p(token_address text, quantity numeric, avg_entry_price numeric, opened_at timestamptz, side text, margin numeric, stop_price numeric);
  update public.agents set cash = p_cash where id = p_agent_id;
end;
$$;
