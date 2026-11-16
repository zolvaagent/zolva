-- Leaderboard timeframes (owner request 2026-11-16): each published paper agent's value at the start of the
-- last 24 hours, 7 days and 30 days (counted back from its own newest hour), and its worst drop inside that
-- window. The app turns them into the period's return and its edge over holding. An agent younger than the
-- period has no starting value (null): it is shown without a number for that timeframe.

create or replace function agent_period_stats()
returns table (agent_id uuid, period text, base_equity numeric, base_hold_equity numeric, max_drawdown numeric)
language sql
stable
set search_path = ''
as $$
  with agents as (
    select a.id, (select max(r.ts) from public.agent_runs r where r.agent_id = a.id) as last_ts
      from public.agents a
     where a.mode = 'paper' and a.published_at is not null
  ),
  periods (period, span) as (
    values ('24h', interval '24 hours'), ('7d', interval '7 days'), ('30d', interval '30 days')
  )
  select g.id,
         p.period,
         b.equity,
         b.hold_equity,
         (select max((w.peak - w.equity) / nullif(w.peak, 0))
            from (select r.equity, max(r.equity) over (order by r.ts) as peak
                    from public.agent_runs r
                   where r.agent_id = g.id and r.ts >= g.last_ts - p.span) w)
    from agents g
   cross join periods p
    left join lateral (
      select r.equity, r.hold_equity
        from public.agent_runs r
       where r.agent_id = g.id and r.ts <= g.last_ts - p.span
       order by r.ts desc
       limit 1
    ) b on true
   where g.last_ts is not null;
$$;

revoke execute on function public.agent_period_stats() from public, anon, authenticated;
grant execute on function public.agent_period_stats() to service_role;
