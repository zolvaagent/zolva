-- Public stats for /stats: everything Zolva's engine has done, in one call.
-- Read only, aggregated in SQL so the page stays one query however much history grows.
--
-- A "decision" is one agent looking at one token in one hour and choosing buy,
-- sell, short, cover or hold, always with written reasoning (agent_runs.decisions).
-- Paper volume is simulated; live trades are the confirmed on-chain executions.

create function public_stats(p_days integer default 30) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'decisions', (select coalesce(sum(jsonb_array_length(r.decisions)), 0) from public.agent_runs r where jsonb_typeof(r.decisions) = 'array'),
        'agent_hours', (select count(*) from public.agent_runs),
        'engine_hours', (select count(distinct r.ts) from public.agent_runs r),
        'first_run', (select min(r.ts) from public.agent_runs r),
        'last_tick', (select max(r.ts) from public.agent_runs r),
        'paper_trades', (select count(*) from public.trades t join public.agents a on a.id = t.agent_id where a.mode = 'paper'),
        'paper_volume', (select coalesce(sum(abs(t.quantity * t.price)), 0) from public.trades t join public.agents a on a.id = t.agent_id where a.mode = 'paper'),
        'live_trades', (select count(*) from public.executions e where e.status = 'confirmed'),
        'agents_active', (select count(*) from public.agents a where a.status = 'active'),
        'agents_total', (select count(*) from public.agents),
        'candles', (select count(*) from public.candles),
        'first_candle', (select min(c.ts) from public.candles c),
        'markets', (select count(*) from public.tokens k where k.enabled),
        'ai_reviews', (select count(*) from public.ai_usage),
        'ai_strategies', (select count(*) from public.ai_generations)
      )
    ),
    -- Per UTC day over the last p_days: decisions made and paper trades placed.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', runs.day, 'decisions', runs.decisions, 'trades', coalesce(fills.trades, 0)) order by runs.day)
      from (
        select date_trunc('day', r.ts) as day,
               sum(case when jsonb_typeof(r.decisions) = 'array' then jsonb_array_length(r.decisions) else 0 end) as decisions
        from public.agent_runs r
        where r.ts >= date_trunc('day', now()) - make_interval(days => p_days - 1)
        group by 1
      ) runs
      left join (
        select date_trunc('day', t.ts) as day, count(*) as trades
        from public.trades t
        where t.ts >= date_trunc('day', now()) - make_interval(days => p_days - 1)
        group by 1
      ) fills on fills.day = runs.day
    ), '[]'::jsonb),
    'top_tokens', coalesce((
      select jsonb_agg(x order by x.trades desc, x.symbol)
      from (
        select k.symbol, k.address, count(*) as trades
        from public.trades t
        join public.tokens k on k.address = t.token_address
        group by k.symbol, k.address
        order by count(*) desc, k.symbol
        limit 6
      ) x
    ), '[]'::jsonb),
    'strategies', coalesce((
      select jsonb_agg(x order by x.agents desc, x.strategy)
      from (
        select a.strategy, count(*) as agents
        from public.agents a
        where a.status = 'active'
        group by a.strategy
      ) x
    ), '[]'::jsonb),
    -- The latest confirmed real money trades, each provable on Blockscout.
    'live', coalesce((
      select jsonb_agg(x order by x.confirmed_at desc)
      from (
        -- Sells have no intended dollar amount; their size is what filled.
        select e.confirmed_at, k.symbol, e.side, coalesce(e.intended_usd, e.filled_quantity * e.fill_price) as usd, e.tx_hash
        from public.executions e
        join public.tokens k on k.address = e.token_address
        where e.status = 'confirmed' and e.tx_hash is not null
        order by e.confirmed_at desc
        limit 5
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.public_stats(integer) from public, anon, authenticated;
grant execute on function public.public_stats(integer) to service_role;
