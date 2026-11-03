-- Spike fade (docs/shorting-research.md): the first strategy that shorts, paper only.
-- A short is a position with side 'short': quantity is the borrowed tokens sold,
-- avg_entry_price the sale price. Opening it is a 'short' trade, closing it a 'cover'.

alter table agents drop constraint agents_strategy_check;
alter table agents add constraint agents_strategy_check
  check (strategy in ('momentum', 'mean_reversion', 'dip_hunter', 'spike_fade', 'custom'));

-- The live executor can only buy and sell, so real money agents can never short.
alter table agents add constraint agents_live_no_shorts check (mode = 'paper' or strategy <> 'spike_fade');

alter table positions add column side text not null default 'long' check (side in ('long', 'short'));

alter table trades drop constraint trades_side_check;
alter table trades add constraint trades_side_check check (side in ('buy', 'sell', 'short', 'cover'));

-- Same as before, plus each position's side (missing means long).
create or replace function apply_agent_hour(
  p_agent_id    uuid,
  p_ts          timestamptz,
  p_cash        numeric,
  p_equity      numeric,
  p_hold_equity numeric,
  p_decisions   jsonb,
  p_positions   jsonb,  -- [{ token_address, quantity, avg_entry_price, opened_at, side? }]
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
  insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at, side)
  select p_agent_id, p.token_address, p.quantity, p.avg_entry_price, p.opened_at, coalesce(p.side, 'long')
    from jsonb_to_recordset(p_positions) as p(token_address text, quantity numeric, avg_entry_price numeric, opened_at timestamptz, side text);

  update public.agents set cash = p_cash, last_run_ts = p_ts where id = p_agent_id;
  return true;
end;
$$;
