-- Call-only trench agent (owner 2026-11-23): a Rushr agent that posts calls picked by runMinute
-- (Curve Rider checks) but never buys. Its wallet exists only to sign Rushr's sign-in, holds no
-- funds and has a Privy policy that allows no transaction; the runner never trades for it
-- (lib/trench/runner.ts). Each call opens a paper position, tracked with the same exits, and its
-- exit is posted as a reply under the call. Doubles as a zero-cost forward record.

alter table trench_agents add column call_only boolean not null default false;

-- Paper positions: no transaction behind them, so they never count toward Zolva's real exposure.
alter table trench_positions add column paper boolean not null default false;
-- Market cap at the call, for valuing a paper position that left the curve.
alter table trench_positions add column call_mcap double precision;

-- A paper position belongs only to a call-only agent, and a call-only agent holds only paper.
create or replace function trench_positions_paper_check() returns trigger language plpgsql set search_path = public as $$
begin
  if new.paper is distinct from (select call_only from trench_agents where id = new.agent_id) then
    raise exception 'paper positions belong only to call-only agents';
  end if;
  return new;
end $$;

create trigger trench_positions_paper_check
  before insert or update of paper, agent_id on trench_positions
  for each row execute function trench_positions_paper_check();

-- A call-only agent never has a trade or an order.
create or replace function trench_no_trades_for_call_only() returns trigger language plpgsql set search_path = public as $$
begin
  if (select call_only from trench_agents where id = new.agent_id) then
    raise exception 'call-only agents never trade';
  end if;
  return new;
end $$;

create trigger trench_trades_no_call_only before insert on trench_trades
  for each row execute function trench_no_trades_for_call_only();
create trigger trench_executions_no_call_only before insert on trench_executions
  for each row execute function trench_no_trades_for_call_only();

create index trench_positions_paper_idx on trench_positions (agent_id, opened_at) where paper;
