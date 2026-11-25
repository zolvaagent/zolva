-- Faster agent_stats (owner 2026-11-25: "perbaiki dulu"). The view recomputed every agent's runs on every
-- read: a window function over all agent_runs (~40k rows, +2.3k a day) plus sorted aggregates, ~250 ms a
-- call and growing, and it hit the statement timeout on 2026-11-23 and 2026-11-25 (pages 500 or 15 s).
-- Now each agent has one summary row, kept by a trigger as hourly runs are written; agent_stats reads it.
-- agent_runs is insert only (record_agent_hour inserts with "on conflict do nothing"; nothing updates or
-- deletes rows except the cascade when an agent is deleted), so an insert trigger sees every run.

create table agent_run_summaries (
  agent_id      uuid primary key references agents (id) on delete cascade,
  runs          bigint not null,
  -- Highest equity so far, for the running worst drop.
  peak          numeric not null,
  max_drawdown  numeric not null,
  -- Equity and hold equity of the newest run, and its hour.
  equity        numeric not null,
  hold_equity   numeric not null,
  last_ts       timestamptz not null
);
alter table agent_run_summaries enable row level security;

-- Same numbers as the old view: runs counted, worst drop = max over runs of (peak so far - equity) / peak,
-- equity and hold equity of the newest hour. Runs are written oldest first; a late older hour still counts
-- and can raise the peak, but never replaces the newest equity.
create function agent_run_summaries_add() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.agent_run_summaries as s (agent_id, runs, peak, max_drawdown, equity, hold_equity, last_ts)
  values (new.agent_id, 1, new.equity, 0, new.equity, new.hold_equity, new.ts)
  on conflict (agent_id) do update set
    runs = s.runs + 1,
    peak = greatest(s.peak, excluded.peak),
    max_drawdown = greatest(s.max_drawdown, (greatest(s.peak, excluded.peak) - excluded.equity) / nullif(greatest(s.peak, excluded.peak), 0)),
    equity = case when excluded.last_ts >= s.last_ts then excluded.equity else s.equity end,
    hold_equity = case when excluded.last_ts >= s.last_ts then excluded.hold_equity else s.hold_equity end,
    last_ts = greatest(s.last_ts, excluded.last_ts);
  return null;
end;
$$;

-- Creating the trigger locks agent_runs against writes until this migration commits, so the fill below
-- and the trigger cannot miss or double count a run.
create trigger agent_runs_summary after insert on agent_runs for each row execute function agent_run_summaries_add();

insert into agent_run_summaries (agent_id, runs, peak, max_drawdown, equity, hold_equity, last_ts)
select agent_id,
       count(*),
       max(equity),
       coalesce(max((peak - equity) / nullif(peak, 0)), 0),
       (array_agg(equity order by ts desc))[1],
       (array_agg(hold_equity order by ts desc))[1],
       max(ts)
  from (select agent_id, ts, equity, hold_equity, max(equity) over (partition by agent_id order by ts) as peak from agent_runs) runs
 group by agent_id;

revoke all on function agent_run_summaries_add() from public, anon, authenticated;

-- Same columns, types and order as before (security_invoker stays set on the view).
create or replace view agent_stats with (security_invoker = true) as
select a.id,
       a.owner,
       a.name,
       a.strategy,
       a.mode,
       a.status,
       a.token_addresses,
       a.start_capital,
       a.created_at,
       coalesce(s.equity, a.start_capital) as equity,
       coalesce(s.hold_equity, a.start_capital) as hold_equity,
       coalesce(s.runs, 0::bigint) as runs,
       coalesce(s.max_drawdown, 0::numeric) as max_drawdown,
       s.last_ts,
       (select count(*) from trades t where t.agent_id = a.id) as trades,
       a.published_at
  from agents a
  left join agent_run_summaries s on s.agent_id = a.id;
