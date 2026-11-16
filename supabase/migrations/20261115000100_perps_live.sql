-- Perps with real money on Lighter RH, owner only (2026-11-15, docs/plan-actions-perps-live.md step P).
-- A perps live agent trades from its own Lighter sub-account (agents.lighter_account_index) through the
-- zolva-lighter Worker, which holds the API key. Lighter is the truth for its positions and cash:
-- sync_lighter_agent copies them in, and every order is recorded in executions (venue lighter).
-- Users still cannot create perps live agents: create.ts refuses them, and only an agent with a
-- lighter_account_index (set by Zolva, never by the API) passes the guard below.

alter table agents add column lighter_account_index bigint unique;

alter table executions
  add column venue text not null default 'uniswap' check (venue in ('uniswap', 'lighter')),
  add column reduce_only boolean,
  -- Lighter's tx hashes are 80 hex characters without 0x, so they do not fit tx_hash's check.
  add column lighter_tx_hash text check (lighter_tx_hash ~ '^[0-9a-f]{40,128}$'),
  add column filled_base numeric check (filled_base > 0);
alter table executions drop constraint executions_reason_check;
alter table executions add constraint executions_reason_check check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold', 'manual', 'resize'));

-- Same as 20261114000200_lab_shorts, except: a perps agent may be live when it has a Lighter account.
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

-- Same as 20261028000100_live_executor, except: a Lighter agent's money is in its Lighter sub-account,
-- not in a Privy wallet, so it skips the wallet allowlist. The capital cap still applies.
create or replace function live_agent_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap numeric;
begin
  if new.mode <> 'live' then
    return new;
  end if;
  if new.lighter_account_index is null and not exists (select 1 from public.live_wallets w where w.address = new.trading_wallet) then
    raise exception 'live_wallet_not_allowed: % is not on the live allowlist', new.trading_wallet;
  end if;
  select max_agent_capital_usd into cap from public.live_settings where id = 1;
  if new.start_capital > cap then
    raise exception 'live_capital_over_cap: % is above the % cap', new.start_capital, cap;
  end if;
  return new;
end;
$$;

/**
 * Copies a Lighter agent's account into Zolva: cash and positions, as the engine sees them
 * (lib/live/lighter.ts engineStateFromLighter). Called after every order and at the start of each hour.
 */
create function sync_lighter_agent(p_agent_id uuid, p_cash numeric, p_positions jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.agents where id = p_agent_id and lighter_account_index is not null) then
    raise exception 'sync_lighter_agent: % is not a Lighter agent', p_agent_id;
  end if;
  delete from public.positions where agent_id = p_agent_id;
  insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at, side, margin, stop_price)
  select p_agent_id, p.token_address, p.quantity, p.avg_entry_price, p.opened_at, coalesce(p.side, 'long'), null, p.stop_price
    from jsonb_to_recordset(p_positions) as p(token_address text, quantity numeric, avg_entry_price numeric, opened_at timestamptz, side text, stop_price numeric);
  update public.agents set cash = p_cash where id = p_agent_id;
end;
$$;

/**
 * Confirms one Lighter order: the execution and the trade the agent page shows. The trade price is
 * the reference price at the order (Lighter fills inside the worst price we signed). Idempotent.
 */
create function apply_lighter_fill(
  p_execution_id uuid,
  p_lighter_tx_hash text,
  p_side text,
  p_filled_base numeric,
  p_price numeric
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  ex public.executions%rowtype;
begin
  select * into ex from public.executions where id = p_execution_id for update;
  if not found or ex.status = 'confirmed' then
    return false;
  end if;
  if p_side not in ('buy', 'sell', 'short', 'cover') then
    raise exception 'apply_lighter_fill: bad side %', p_side;
  end if;
  update public.executions
     set status = 'confirmed', lighter_tx_hash = p_lighter_tx_hash, filled_base = p_filled_base,
         filled_quantity = p_filled_base, fill_price = p_price, confirmed_at = now()
   where id = p_execution_id;
  insert into public.trades (agent_id, ts, token_address, side, quantity, price, cost_usd, reason)
  values (ex.agent_id, ex.decided_ts, ex.token_address, p_side, p_filled_base, p_price, 0, ex.reason);
  return true;
end;
$$;

revoke execute on function public.sync_lighter_agent(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.sync_lighter_agent(uuid, numeric, jsonb) to service_role;
revoke execute on function public.apply_lighter_fill(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.apply_lighter_fill(uuid, text, text, numeric, numeric) to service_role;
