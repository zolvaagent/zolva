-- AI co-pilot (docs/ai-and-token-plan.md, Phase A).
--
-- An agent can have an AI model that reviews its rule signals before they
-- trade. Every model call is paid from the owner's AI credits:
--   free: a one-time welcome grant, usable only on Lite models;
--   paid: manual grants for now (top-up is "coming soon"), any model.
-- Amounts are micro-USD (1 USD = 1,000,000) so sums stay exact.

alter table agents add column ai_model text;

create table ai_credits (
  owner              text primary key references wallets (address) on delete cascade,
  free_micro         bigint not null default 0,
  paid_micro         bigint not null default 0,
  welcome_granted_at timestamptz,
  updated_at         timestamptz not null default now()
);

-- Every change to a balance, for support and audits.
create table ai_ledger (
  id           bigint generated always as identity primary key,
  owner        text not null references wallets (address) on delete cascade,
  bucket       text not null check (bucket in ('free', 'paid')),
  delta_micro  bigint not null,
  kind         text not null check (kind in ('welcome', 'manual', 'spend', 'refund')),
  note         text,
  created_at   timestamptz not null default now()
);
create index ai_ledger_owner on ai_ledger (owner, created_at desc);

-- One AI review per agent per hour. The row is claimed before the model is
-- called, so two ticks running at once can never pay twice for the same hour.
create table ai_usage (
  id             bigint generated always as identity primary key,
  agent_id       uuid not null references agents (id) on delete cascade,
  owner          text not null,
  ts             timestamptz not null,
  model          text not null,
  status         text not null default 'pending' check (status in ('pending', 'done', 'failed', 'skipped')),
  input_tokens   integer,
  output_tokens  integer,
  cost_micro     bigint not null default 0,
  paid_from      text check (paid_from in ('free', 'paid')),
  note           text,
  created_at     timestamptz not null default now(),
  unique (agent_id, ts)
);
create index ai_usage_created on ai_usage (created_at);

alter table ai_credits enable row level security;
alter table ai_ledger enable row level security;
alter table ai_usage enable row level security;

-- Welcome grant, at most once per owner. Returns the amount granted (0 if already done).
create function ai_grant_welcome(p_owner text, p_amount_micro bigint) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  granted bigint := 0;
begin
  insert into public.ai_credits (owner) values (p_owner) on conflict (owner) do nothing;
  update public.ai_credits
     set free_micro = free_micro + p_amount_micro, welcome_granted_at = now(), updated_at = now()
   where owner = p_owner and welcome_granted_at is null
  returning p_amount_micro into granted;
  if granted > 0 then
    insert into public.ai_ledger (owner, bucket, delta_micro, kind) values (p_owner, 'free', granted, 'welcome');
  end if;
  return coalesce(granted, 0);
end;
$$;

-- Manual grant or refund by an admin (scripts/grant-credits.mts).
create function ai_grant(p_owner text, p_bucket text, p_amount_micro bigint, p_kind text, p_note text) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_amount_micro <= 0 or p_kind not in ('manual', 'refund') or p_bucket not in ('free', 'paid') then
    raise exception 'ai_grant: invalid grant';
  end if;
  insert into public.ai_credits (owner) values (p_owner) on conflict (owner) do nothing;
  update public.ai_credits
     set free_micro = free_micro + case when p_bucket = 'free' then p_amount_micro else 0 end,
         paid_micro = paid_micro + case when p_bucket = 'paid' then p_amount_micro else 0 end,
         updated_at = now()
   where owner = p_owner;
  insert into public.ai_ledger (owner, bucket, delta_micro, kind, note) values (p_owner, p_bucket, p_amount_micro, p_kind, p_note);
end;
$$;

-- Claims the review slot for one agent hour. False when another tick already has it.
create function ai_claim(p_agent_id uuid, p_owner text, p_ts timestamptz, p_model text) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.ai_usage (agent_id, owner, ts, model) values (p_agent_id, p_owner, p_ts, p_model);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Records the result of a claimed review and charges it. Lite models spend
-- free credits first, then paid; other models spend paid credits only. A
-- balance may dip slightly below zero on the last call; the next call is then
-- refused by the balance check in the app.
create function ai_settle(p_agent_id uuid, p_ts timestamptz, p_status text, p_input integer, p_output integer, p_cost_micro bigint, p_lite boolean, p_note text) returns text
language plpgsql
set search_path = ''
as $$
declare
  usage_owner text;
  free_left bigint;
  source text := null;
begin
  select owner into usage_owner from public.ai_usage where agent_id = p_agent_id and ts = p_ts and status = 'pending' for update;
  if usage_owner is null then
    raise exception 'ai_settle: no pending review';
  end if;

  if p_cost_micro > 0 then
    select free_micro into free_left from public.ai_credits where owner = usage_owner for update;
    source := case when p_lite and coalesce(free_left, 0) > 0 then 'free' else 'paid' end;
    update public.ai_credits
       set free_micro = free_micro - case when source = 'free' then p_cost_micro else 0 end,
           paid_micro = paid_micro - case when source = 'paid' then p_cost_micro else 0 end,
           updated_at = now()
     where owner = usage_owner;
    insert into public.ai_ledger (owner, bucket, delta_micro, kind, note)
    values (usage_owner, source, -p_cost_micro, 'spend', p_ts::text);
  end if;

  update public.ai_usage
     set status = p_status, input_tokens = p_input, output_tokens = p_output, cost_micro = p_cost_micro, paid_from = source, note = p_note
   where agent_id = p_agent_id and ts = p_ts;
  return source;
end;
$$;

-- What all AI reviews cost since a moment (the global daily brake).
create function ai_spent_since(p_from timestamptz) returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(cost_micro), 0)::bigint from public.ai_usage where created_at >= p_from;
$$;

revoke execute on function public.ai_grant_welcome(text, bigint) from public, anon, authenticated;
revoke execute on function public.ai_grant(text, text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.ai_claim(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.ai_settle(uuid, timestamptz, text, integer, integer, bigint, boolean, text) from public, anon, authenticated;
revoke execute on function public.ai_spent_since(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_grant_welcome(text, bigint) to service_role;
grant execute on function public.ai_grant(text, text, bigint, text, text) to service_role;
grant execute on function public.ai_claim(uuid, text, timestamptz, text) to service_role;
grant execute on function public.ai_settle(uuid, timestamptz, text, integer, integer, bigint, boolean, text) to service_role;
grant execute on function public.ai_spent_since(timestamptz) to service_role;
