-- Per agent AI budget chosen by its owner: the co-pilot may spend at most
-- ai_limit_micro in total on this agent, until ai_limit_expires_at. Whichever
-- comes first (the limit, the date, or the account's credits running out)
-- stops the co-pilot and the agent keeps trading on its rules. A limit may be
-- larger than the account's balance: it is a cap, nothing is reserved.

alter table agents
  add column ai_limit_micro bigint check (ai_limit_micro > 0),
  add column ai_limit_expires_at timestamptz;

-- Agents that already use the co-pilot get a starting budget they can change.
update agents
   set ai_limit_micro = 500000, ai_limit_expires_at = now() + interval '30 days'
 where ai_model is not null and ai_limit_micro is null;

-- Claims the review slot for one agent hour, checking the agent's budget in
-- the same statement so it cannot be overspent by more than one call.
-- Returns 'ok', 'claimed' (another tick has this hour), 'limit' or 'expired'.
create function ai_claim_review(p_agent_id uuid, p_owner text, p_ts timestamptz, p_model text, p_max_cost_micro bigint) returns text
language plpgsql
set search_path = ''
as $$
declare
  agent_limit bigint;
  agent_expires timestamptz;
  spent bigint;
begin
  select ai_limit_micro, ai_limit_expires_at into agent_limit, agent_expires from public.agents where id = p_agent_id;
  if agent_expires is not null and agent_expires <= now() then
    return 'expired';
  end if;
  if agent_limit is not null then
    select coalesce(sum(cost_micro), 0) into spent from public.ai_usage where agent_id = p_agent_id;
    if spent + p_max_cost_micro > agent_limit then
      return 'limit';
    end if;
  end if;
  insert into public.ai_usage (agent_id, owner, ts, model) values (p_agent_id, p_owner, p_ts, p_model);
  return 'ok';
exception when unique_violation then
  return 'claimed';
end;
$$;

-- ai_claim is replaced by ai_claim_review; it is dropped in a later migration,
-- after the app that calls the new function is deployed.

revoke execute on function public.ai_claim_review(uuid, text, timestamptz, text, bigint) from public, anon, authenticated;
grant execute on function public.ai_claim_review(uuid, text, timestamptz, text, bigint) to service_role;
