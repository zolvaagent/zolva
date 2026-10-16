-- Prompt mode in the Studio: a user describes a strategy in plain words, the
-- AI strategy writer turns it into Custom rules (backtested as usual), and the
-- words are kept as notes the agent's AI co-pilot follows on live hours.

alter table agents add column strategy_prompt text check (char_length(strategy_prompt) <= 600);

-- One row per strategy writer call. The row is inserted before the model is
-- called, so the per account daily limit holds even with parallel requests.
create table ai_generations (
  id             bigint generated always as identity primary key,
  owner          text not null references wallets (address) on delete cascade,
  model          text not null,
  status         text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  input_tokens   integer,
  output_tokens  integer,
  cost_micro     bigint not null default 0,
  paid_from      text check (paid_from in ('free', 'paid')),
  note           text,
  created_at     timestamptz not null default now()
);
create index ai_generations_owner on ai_generations (owner, created_at desc);
create index ai_generations_created on ai_generations (created_at);
alter table ai_generations enable row level security;

-- Starts a strategy writer call. Returns its id, or null when the account has
-- used its daily limit (the refused row is removed again).
create function ai_generation_start(p_owner text, p_model text, p_daily_limit integer) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  new_id bigint;
  used integer;
begin
  insert into public.ai_generations (owner, model) values (p_owner, p_model) returning id into new_id;
  select count(*) into used from public.ai_generations where owner = p_owner and created_at >= now() - interval '24 hours';
  if used > p_daily_limit then
    delete from public.ai_generations where id = new_id;
    return null;
  end if;
  return new_id;
end;
$$;

-- Records the result and charges it, with the same buckets as ai_settle:
-- Lite models spend free credits first, other models paid credits only.
create function ai_generation_settle(p_id bigint, p_status text, p_input integer, p_output integer, p_cost_micro bigint, p_lite boolean, p_note text) returns text
language plpgsql
set search_path = ''
as $$
declare
  generation_owner text;
  free_left bigint;
  source text := null;
begin
  select owner into generation_owner from public.ai_generations where id = p_id and status = 'pending' for update;
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
    values (generation_owner, source, -p_cost_micro, 'spend', 'strategy writer');
  end if;

  update public.ai_generations
     set status = p_status, input_tokens = p_input, output_tokens = p_output, cost_micro = p_cost_micro, paid_from = source, note = p_note
   where id = p_id;
  return source;
end;
$$;

-- The global daily brake now counts strategy writer calls too.
create or replace function ai_spent_since(p_from timestamptz) returns bigint
language sql
stable
set search_path = ''
as $$
  select (select coalesce(sum(cost_micro), 0) from public.ai_usage where created_at >= p_from)
       + (select coalesce(sum(cost_micro), 0) from public.ai_generations where created_at >= p_from);
$$;

revoke execute on function public.ai_generation_start(text, text, integer) from public, anon, authenticated;
revoke execute on function public.ai_generation_settle(bigint, text, integer, integer, bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.ai_generation_start(text, text, integer) to service_role;
grant execute on function public.ai_generation_settle(bigint, text, integer, integer, bigint, boolean, text) to service_role;
