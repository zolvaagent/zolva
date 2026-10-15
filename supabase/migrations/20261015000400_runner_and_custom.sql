-- Agent runner support and custom strategies (2026-10-15).

-- Custom strategies: the rules live in agents.params.rules (validated by the app).
alter table agents drop constraint agents_strategy_check;
alter table agents add constraint agents_strategy_check check (strategy in ('momentum', 'mean_reversion', 'custom'));

-- Custom rules can also sell on take profit or after a max holding time.
alter table trades drop constraint trades_reason_check;
alter table trades add constraint trades_reason_check check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold'));
alter table executions drop constraint executions_reason_check;
alter table executions add constraint executions_reason_check check (reason in ('signal', 'stop_loss', 'take_profit', 'max_hold'));

-- When a position was opened, for the max holding time.
alter table positions add column opened_at timestamptz;

-- Value of buying and holding the same tokens since launch, per hour, so
-- every agent can be shown next to "just holding".
alter table agent_runs add column hold_equity numeric;

-- Writes one processed hour for one agent in a single transaction: the run,
-- its trades, the new positions and the new cash. Returns false (and writes
-- nothing) if that hour was already processed, so a repeated tick is harmless.
create function apply_agent_hour(
  p_agent_id    uuid,
  p_ts          timestamptz,
  p_cash        numeric,
  p_equity      numeric,
  p_hold_equity numeric,
  p_decisions   jsonb,
  p_positions   jsonb,  -- [{ token_address, quantity, avg_entry_price, opened_at }]
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
  insert into public.positions (agent_id, token_address, quantity, avg_entry_price, opened_at)
  select p_agent_id, p.token_address, p.quantity, p.avg_entry_price, p.opened_at
    from jsonb_to_recordset(p_positions) as p(token_address text, quantity numeric, avg_entry_price numeric, opened_at timestamptz);

  update public.agents set cash = p_cash, last_run_ts = p_ts where id = p_agent_id;
  return true;
end;
$$;

-- One row per agent with its latest numbers, for the leaderboard and dashboard.
create view agent_stats with (security_invoker = true) as
with runs as (
  select agent_id, ts, equity, hold_equity,
         max(equity) over (partition by agent_id order by ts) as peak
    from public.agent_runs
), summary as (
  select agent_id,
         count(*) as runs,
         max((peak - equity) / nullif(peak, 0)) as max_drawdown,
         (array_agg(equity order by ts desc))[1] as equity,
         (array_agg(hold_equity order by ts desc))[1] as hold_equity,
         max(ts) as last_ts
    from runs
   group by agent_id
)
select a.id, a.owner, a.name, a.strategy, a.mode, a.status, a.token_addresses, a.start_capital, a.created_at,
       coalesce(s.equity, a.start_capital) as equity,
       coalesce(s.hold_equity, a.start_capital) as hold_equity,
       coalesce(s.runs, 0) as runs,
       coalesce(s.max_drawdown, 0) as max_drawdown,
       s.last_ts,
       (select count(*) from public.trades t where t.agent_id = a.id) as trades
  from public.agents a
  left join summary s on s.agent_id = a.id;
