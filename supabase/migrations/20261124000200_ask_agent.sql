-- "Ask your agent" (owner 2026-11-24): anyone logged in can ask a public agent (or the owner their
-- own agent) about its decisions; a Lite model answers from the agent's rules and decision log.
-- Each question is one row in ai_generations, claimed and settled like the strategy writer and paid
-- from the asker's AI credits. kind keeps the two daily limits apart.

alter table ai_generations add column kind text not null default 'strategy'
  constraint ai_generations_kind check (kind in ('strategy', 'ask'));
create index ai_generations_owner_kind on ai_generations (owner, kind, created_at desc);

-- Same as before, plus p_kind: the daily limit counts only calls of the same kind. The default keeps
-- the strategy writer's three-argument call working unchanged.
drop function ai_generation_start(text, text, integer);
create function ai_generation_start(p_owner text, p_model text, p_daily_limit integer, p_kind text default 'strategy') returns bigint
language plpgsql
set search_path = ''
as $$
declare
  new_id bigint;
  used integer;
begin
  insert into public.ai_generations (owner, model, kind) values (p_owner, p_model, p_kind) returning id into new_id;
  select count(*) into used from public.ai_generations where owner = p_owner and kind = p_kind and created_at >= now() - interval '24 hours';
  if used > p_daily_limit then
    delete from public.ai_generations where id = new_id;
    return null;
  end if;
  return new_id;
end;
$$;

-- Same as before; only the ledger note now says which feature spent the credits.
create or replace function ai_generation_settle(p_id bigint, p_status text, p_input integer, p_output integer, p_cost_micro bigint, p_lite boolean, p_note text) returns text
language plpgsql
set search_path = ''
as $$
declare
  generation_owner text;
  generation_kind text;
  free_left bigint;
  source text := null;
begin
  select owner, kind into generation_owner, generation_kind from public.ai_generations where id = p_id and status = 'pending' for update;
  if generation_owner is null then
    raise exception 'ai_generation_settle: no pending generation';
  end if;

  if p_cost_micro > 0 then
    select free_micro into free_left from public.ai_credits where owner = generation_owner for update;
    source := case when p_lite and coalesce(free_left, 0) > 0 then 'free' else 'paid' end;
    update public.ai_credits
       set free_micro = free_micro - case when source = 'free' then p_cost_micro else 0 end,
           paid_micro = paid_micro - case when source = 'paid' then p_cost_micro else 0 end,
           updated_at = now()
     where owner = generation_owner;
    insert into public.ai_ledger (owner, bucket, delta_micro, kind, note)
    values (generation_owner, source, -p_cost_micro, 'spend', case generation_kind when 'ask' then 'ask your agent' else 'strategy writer' end);
  end if;

  update public.ai_generations
     set status = p_status, input_tokens = p_input, output_tokens = p_output, cost_micro = p_cost_micro, paid_from = source, note = p_note
   where id = p_id;
  return source;
end;
$$;

revoke execute on function public.ai_generation_start(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.ai_generation_start(text, text, integer, text) to service_role;
