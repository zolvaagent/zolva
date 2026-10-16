-- User agents are private until their owner publishes them. Only published
-- agents appear on the leaderboard, the landing page, markets and activity.
-- Zolva's own house and lab agents are always published.

alter table agents add column published_at timestamptz;

update agents set published_at = created_at
 where owner in ('0x5174000000000000000000000000000000000000', '0x5174000000000000000000000000000000000001', '0x5174000000000000000000000000000000000002');

-- Same view, plus published_at (appended, so existing columns keep their order).
create or replace view agent_stats with (security_invoker = true) as
 WITH runs AS (
         SELECT agent_runs.agent_id,
            agent_runs.ts,
            agent_runs.equity,
            agent_runs.hold_equity,
            max(agent_runs.equity) OVER (PARTITION BY agent_runs.agent_id ORDER BY agent_runs.ts) AS peak
           FROM agent_runs
        ), summary AS (
         SELECT runs.agent_id,
            count(*) AS runs,
            max((runs.peak - runs.equity) / NULLIF(runs.peak, 0::numeric)) AS max_drawdown,
            (array_agg(runs.equity ORDER BY runs.ts DESC))[1] AS equity,
            (array_agg(runs.hold_equity ORDER BY runs.ts DESC))[1] AS hold_equity,
            max(runs.ts) AS last_ts
           FROM runs
          GROUP BY runs.agent_id
        )
 SELECT a.id,
    a.owner,
    a.name,
    a.strategy,
    a.mode,
    a.status,
    a.token_addresses,
    a.start_capital,
    a.created_at,
    COALESCE(s.equity, a.start_capital) AS equity,
    COALESCE(s.hold_equity, a.start_capital) AS hold_equity,
    COALESCE(s.runs, 0::bigint) AS runs,
    COALESCE(s.max_drawdown, 0::numeric) AS max_drawdown,
    s.last_ts,
    ( SELECT count(*) AS count
           FROM trades t
          WHERE t.agent_id = a.id) AS trades,
    a.published_at
   FROM agents a
     LEFT JOIN summary s ON s.agent_id = a.id;

-- Activity report: published agents only.
create or replace function agent_activity(p_from timestamptz, p_trade_limit integer default 500) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'hours', coalesce((
      select jsonb_agg(h order by h.ts desc)
      from (
        select r.ts,
               count(*) as checked,
               (select count(*) from public.trades t join public.agents a2 on a2.id = t.agent_id
                 where t.ts = r.ts and t.side = 'buy' and a2.mode = 'paper' and a2.published_at is not null) as buys,
               (select count(*) from public.trades t join public.agents a2 on a2.id = t.agent_id
                 where t.ts = r.ts and t.side = 'sell' and a2.mode = 'paper' and a2.published_at is not null) as sells
        from public.agent_runs r
        join public.agents a on a.id = r.agent_id
        where r.ts >= p_from and a.mode = 'paper' and a.published_at is not null
        group by r.ts
      ) h
    ), '[]'::jsonb),
    'trades', coalesce((
      select jsonb_agg(x order by x.ts desc, x.agent_name)
      from (
        select t.ts,
               t.agent_id,
               a.name as agent_name,
               a.owner,
               a.strategy,
               k.symbol,
               t.side,
               t.quantity,
               t.price,
               t.cost_usd,
               t.reason,
               (select d->>'reasoning'
                  from public.agent_runs r, jsonb_array_elements(r.decisions) d
                 where r.agent_id = t.agent_id and r.ts = t.ts and d->>'token' = t.token_address
                 limit 1) as reasoning
        from public.trades t
        join public.agents a on a.id = t.agent_id
        join public.tokens k on k.address = t.token_address
        where t.ts >= p_from and a.mode = 'paper' and a.published_at is not null
        order by t.ts desc
        limit p_trade_limit
      ) x
    ), '[]'::jsonb)
  );
$$;
