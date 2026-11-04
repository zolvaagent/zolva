-- ZOLVA holder tiers (docs/ai-and-token-plan.md section 11). Everything here is
-- written by the server only (service role); RLS is on with no policies.
-- Until the ZOLVA token address is configured every account stays on 'free'.

-- Extra wallets whose ZOLVA counts for an account. The login wallet always counts
-- and is not listed. One wallet belongs to one account.
create table verified_wallets (
  address     text primary key check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  owner       text not null check (owner = lower(owner)),
  verified_at timestamptz not null default now()
);
create index verified_wallets_owner_idx on verified_wallets (owner);
alter table verified_wallets enable row level security;

-- The latest balance read and the tier it gave, per account.
create table memberships (
  owner        text primary key check (owner = lower(owner)),
  tier         text not null default 'free' check (tier in ('free', 'holder', 'pro')),
  -- Summed raw balance (base units) and its worth at the 7 day average price.
  balance      numeric not null default 0,
  holdings_usd numeric not null default 0,
  checked_at   timestamptz,
  -- Set while holdings are below the tier: the lower tier applies after this.
  grace_until  timestamptz
);
alter table memberships enable row level security;

-- Hourly ZOLVA prices, for the 7 day average that values holdings.
create table zolva_prices (
  ts    timestamptz primary key,
  price numeric not null check (price > 0)
);
alter table zolva_prices enable row level security;

-- Active paper agent limit now follows the owner's tier; live stays at 1.
create or replace function agents_active_limit_for(agent_mode text, agent_owner text) returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when agent_mode = 'live' then 1
    else case (select m.tier from public.memberships m where m.owner = agent_owner)
      when 'pro' then 20
      when 'holder' then 10
      else 5
    end
  end;
$$;

create or replace function enforce_active_agent_limit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_count integer;
  allowed integer := public.agents_active_limit_for(new.mode, new.owner);
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.owner));

  select count(*) into active_count
    from public.agents
   where owner = new.owner
     and mode = new.mode
     and status = 'active'
     and id <> new.id;

  if active_count >= allowed then
    raise exception 'active_agent_limit: at most % active % agents per user', allowed, new.mode
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Free hourly AI reviews for holders: settled with the cost recorded but no credits taken.
alter table ai_usage drop constraint ai_usage_paid_from_check;
alter table ai_usage add constraint ai_usage_paid_from_check check (paid_from in ('free', 'paid', 'zolva'));

create function ai_settle_covered(p_agent_id uuid, p_ts timestamptz, p_status text, p_input integer, p_output integer, p_cost_micro bigint, p_note text) returns text
language plpgsql
set search_path = ''
as $$
begin
  update public.ai_usage
     set status = p_status, input_tokens = p_input, output_tokens = p_output, cost_micro = p_cost_micro,
         paid_from = case when p_cost_micro > 0 then 'zolva' end, note = p_note
   where agent_id = p_agent_id and ts = p_ts and status = 'pending';
  if not found then
    raise exception 'ai_settle_covered: no pending review';
  end if;
  return 'zolva';
end;
$$;

revoke execute on function public.ai_settle_covered(uuid, timestamptz, text, integer, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.ai_settle_covered(uuid, timestamptz, text, integer, integer, bigint, text) to service_role;
revoke execute on function public.agents_active_limit_for(text, text) from public, anon, authenticated;
grant execute on function public.agents_active_limit_for(text, text) to service_role;
