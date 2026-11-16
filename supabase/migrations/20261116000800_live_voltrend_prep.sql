-- Live BTC / ETH Vol Trend prep, steps 1 and 2 (owner approved 2026-11-16, Development's
-- live-voltrend-dev-scope.md). Nothing here turns a live agent on.
--
-- 1. Volatility sizing on spot: custom rules on any venue may use `sizing` (was perps only).
-- 2. Partial live sells: a confirmed sell that leaves part of the position (a daily resize) lowers the
--    position instead of deleting it. A full exit still deletes it, as before. Executions accept the
--    resize reason.
-- 3. House live exception: Zolva's own live wallets may run more than one real money agent at a
--    time, up to the number listed in live_agent_allowances. Users stay at one (no row = 1).

-- 2b. Live orders may be a resize (trades already allow it since 20261114000100_vol_sizing.sql).
alter table executions drop constraint executions_reason_check;
alter table executions add constraint executions_reason_check
  check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold', 'manual', 'resize'));

-- 1. Same as 20261114000200_lab_shorts.sql, with the sizing scope widened to spot.
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

-- 2. Same as 20261028000100_live_executor.sql, except a sell that leaves part of the position keeps
-- the rest (same average entry). "Part" means more than a millionth of the position remains.
create or replace function apply_live_fill(
  p_execution_id uuid,
  p_tx_hash      text,
  p_amount_in    numeric,
  p_amount_out   numeric,
  p_gas_used     numeric,
  p_gas_cost_usd numeric
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  e public.executions%rowtype;
  usd numeric;
  qty numeric;
  price numeric;
  cost numeric;
  held numeric;
begin
  select * into e from public.executions where id = p_execution_id for update;
  if not found then
    raise exception 'execution % not found', p_execution_id;
  end if;
  if e.status = 'confirmed' then
    return false;
  end if;

  if e.side = 'buy' then
    usd := p_amount_in;
    qty := p_amount_out;
  else
    usd := p_amount_out;
    qty := p_amount_in;
  end if;
  price := usd / qty;
  cost := p_gas_cost_usd + greatest(0, case when e.side = 'buy' then (price - e.decision_price) * qty else (e.decision_price - price) * qty end);

  update public.executions
     set status = 'confirmed', tx_hash = p_tx_hash, amount_in = p_amount_in, amount_out = p_amount_out,
         filled_quantity = qty, fill_price = price, gas_used = p_gas_used, gas_cost_usd = p_gas_cost_usd,
         confirmed_at = now(), error = null
   where id = p_execution_id;

  insert into public.trades (agent_id, ts, token_address, side, quantity, price, cost_usd, reason, execution_id)
  values (e.agent_id, e.decided_ts, e.token_address, e.side, qty, price, cost, e.reason, e.id);

  if e.side = 'buy' then
    insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at)
    values (e.agent_id, e.token_address, qty, (usd + p_gas_cost_usd) / qty, e.decided_ts)
    on conflict (agent_id, token_address) do update
      set quantity = public.positions.quantity + excluded.quantity,
          avg_entry_price = (public.positions.quantity * public.positions.avg_entry_price + excluded.quantity * excluded.avg_entry_price)
                            / (public.positions.quantity + excluded.quantity);
    update public.agents set cash = greatest(0, cash - usd - p_gas_cost_usd) where id = e.agent_id;
  else
    select p.quantity into held from public.positions p where p.agent_id = e.agent_id and p.token_address = e.token_address for update;
    if held is not null and held - qty > held * 0.000001 then
      update public.positions set quantity = held - qty where agent_id = e.agent_id and token_address = e.token_address;
    else
      delete from public.positions where agent_id = e.agent_id and token_address = e.token_address;
    end if;
    update public.agents set cash = cash + usd - p_gas_cost_usd where id = e.agent_id;
  end if;
  return true;
end;
$$;

-- 3. House live exception. Rows are added by Zolva only (service role); users have none, so they stay at one.
create table live_agent_allowances (
  owner      text primary key references wallets (address),
  max_active integer not null check (max_active between 1 and 5),
  note       text,
  created_at timestamptz not null default now()
);
alter table live_agent_allowances enable row level security;
revoke all on live_agent_allowances from anon, authenticated;

create or replace function agents_active_limit_for(agent_mode text, agent_owner text) returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when agent_mode = 'live' then coalesce((select a.max_active from public.live_agent_allowances a where a.owner = agent_owner), 1)
    else case (select m.tier from public.memberships m where m.owner = agent_owner)
      when 'pro' then 20
      when 'holder' then 10
      else 5
    end
  end;
$$;
