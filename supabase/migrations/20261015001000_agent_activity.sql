-- Activity report: what every paper agent did, hour by hour, in one call.
-- Aggregated in SQL so the page stays one query however many agents run.
--
-- Returns { hours: [{ ts, checked, buys, sells }], trades: [...] }, newest first.
-- `checked` counts agents that ran that hour; trades carry the agent's own
-- reasoning for that stock from the run's decisions.

create function agent_activity(p_from timestamptz, p_trade_limit integer default 500) returns jsonb
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
                 where t.ts = r.ts and t.side = 'buy' and a2.mode = 'paper') as buys,
               (select count(*) from public.trades t join public.agents a2 on a2.id = t.agent_id
                 where t.ts = r.ts and t.side = 'sell' and a2.mode = 'paper') as sells
        from public.agent_runs r
        join public.agents a on a.id = r.agent_id
        where r.ts >= p_from and a.mode = 'paper'
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
        where t.ts >= p_from and a.mode = 'paper'
        order by t.ts desc
        limit p_trade_limit
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.agent_activity(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.agent_activity(timestamptz, integer) to service_role;
