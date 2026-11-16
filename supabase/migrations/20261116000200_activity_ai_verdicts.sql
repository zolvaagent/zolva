-- Activity shows the AI co-pilot's verdicts:
-- - each trade carries ai_verdict / ai_model when the co-pilot reviewed that signal (it approved it,
--   or the trade would not exist)
-- - 'passes' lists the rule signals the co-pilot passed on (no trade happened), with its reason
-- Same function as 20261016000300_publish_agents.sql otherwise: published paper agents only.

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
               d.decision->>'reasoning' as reasoning,
               d.decision->'ai'->>'verdict' as ai_verdict,
               d.decision->'ai'->>'model' as ai_model
        from public.trades t
        join public.agents a on a.id = t.agent_id
        join public.tokens k on k.address = t.token_address
        left join lateral (
          select e as decision
            from public.agent_runs r, jsonb_array_elements(r.decisions) e
           where r.agent_id = t.agent_id and r.ts = t.ts and e->>'token' = t.token_address
           limit 1
        ) d on true
        where t.ts >= p_from and a.mode = 'paper' and a.published_at is not null
        order by t.ts desc
        limit p_trade_limit
      ) x
    ), '[]'::jsonb),
    'passes', coalesce((
      select jsonb_agg(x order by x.ts desc, x.agent_name)
      from (
        select r.ts,
               r.agent_id,
               a.name as agent_name,
               a.owner,
               k.symbol,
               e->'ai'->>'model' as ai_model,
               e->'ai'->>'reasoning' as ai_reasoning
        from public.agent_runs r
        join public.agents a on a.id = r.agent_id
        cross join lateral jsonb_array_elements(r.decisions) e
        join public.tokens k on k.address = e->>'token'
        where r.ts >= p_from and a.mode = 'paper' and a.published_at is not null
          and jsonb_typeof(r.decisions) = 'array'
          and e->'ai'->>'verdict' = 'passed'
        order by r.ts desc
        limit p_trade_limit
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.agent_activity(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.agent_activity(timestamptz, integer) to service_role;
