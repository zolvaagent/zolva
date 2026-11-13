-- Per-user API keys for the public API and MCP (docs/plan-actions-perps-live.md, section 1).
--
-- A key is "zk_" plus 32 random bytes (base64url). Only its SHA-256 (hex) is stored; the
-- secret is shown once, on the Dashboard, when the key is made. Keys act for their owner's
-- account and never grant more than the owner's tier (createAgent and the active agent
-- trigger still apply). Scopes:
--   read:private  the owner's own agents, private and live ones included
--   compute       validate_rules and backtest
--   ai            write_strategy and AI limits (spends the owner's AI credits)
--   agents:write  create, pause, resume, publish and unpublish paper agents
--   live:stop     pause the owner's real money agents (the only real money action)
-- The country (cf-ipcountry at creation, while logged in) is stored; write scopes are
-- refused for blocked countries in the app (lib/api-keys/keys.ts).
--
-- Every write and backtest made with a key is logged in api_key_events, which also holds
-- Idempotency-Key values and the daily caps (20 creates, 200 backtests per account).
--
-- Server-only like every table: RLS on, no policies.

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  owner        text not null references wallets (address) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  -- SHA-256 of the full secret, lowercase hex.
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- The first characters of the secret ("zk_" + 6), so the owner can tell keys apart.
  key_prefix   text not null check (key_prefix ~ '^zk_[A-Za-z0-9_-]{6}$'),
  scopes       text[] not null check (
    cardinality(scopes) between 1 and 5
    and scopes <@ array['read:private', 'compute', 'ai', 'agents:write', 'live:stop']::text[]
  ),
  country      text check (country ~ '^[A-Z]{2}$'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index api_keys_owner_idx on api_keys (owner) where revoked_at is null;

alter table api_keys enable row level security;

-- At most 5 keys that are not revoked per account. The advisory lock per owner
-- serialises the check, as for the active agent limit.
create function enforce_api_key_limit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  key_count integer;
begin
  if new.revoked_at is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('api_keys:' || new.owner));

  select count(*) into key_count
    from public.api_keys
   where owner = new.owner
     and revoked_at is null
     and id <> new.id;

  if key_count >= 5 then
    raise exception 'api_key_limit: at most 5 API keys per account'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger api_keys_limit
  before insert or update of revoked_at, owner on api_keys
  for each row execute function enforce_api_key_limit();

-- ---------------------------------------------------------------------------
-- Audit log, idempotency and daily caps
-- ---------------------------------------------------------------------------

create table api_key_events (
  id              bigint generated always as identity primary key,
  key_id          uuid not null references api_keys (id) on delete cascade,
  owner           text not null references wallets (address) on delete cascade,
  -- The tool name, such as create_paper_agent, pause_agent or backtest.
  action          text not null check (char_length(action) between 1 and 40),
  agent_id        uuid references agents (id) on delete set null,
  -- pending: claimed, still running; ok: done; preview: confirm false; error: refused or failed.
  result          text not null check (result in ('pending', 'ok', 'preview', 'error')),
  detail          text check (char_length(detail) <= 200),
  idempotency_key text check (char_length(idempotency_key) between 1 and 200),
  created_at      timestamptz not null default now()
);

create index api_key_events_owner_idx on api_key_events (owner, created_at desc);
create index api_key_events_caps_idx on api_key_events (owner, action, created_at) where result in ('pending', 'ok');
-- One event per key and Idempotency-Key: a retried create finds the first one.
create unique index api_key_events_idempotency_idx on api_key_events (key_id, idempotency_key) where idempotency_key is not null;

alter table api_key_events enable row level security;

-- Claims one capped action (create_paper_agent, backtest) for a key's owner.
-- Returns one row:
--   status 'claimed'     event_id is the new pending event; settle it with api_key_settle
--   status 'duplicate'   this key already used p_idempotency_key: event_id, result and agent_id are the first call's
--   status 'day_limit'   the owner used p_day_limit of this action in the last 24 hours
--   status 'hour_limit'  the owner used p_hour_limit in the last hour (null = no hourly cap)
-- Errors and previews never count. The advisory lock per owner and action serialises
-- the count, since the Workers rate limiter is approximate.
create function api_key_claim(
  p_key_id uuid,
  p_owner text,
  p_action text,
  p_day_limit integer,
  p_hour_limit integer,
  p_idempotency_key text
) returns table (status text, event_id bigint, result text, agent_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  existing public.api_key_events%rowtype;
  used_day integer;
  used_hour integer;
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('api_key_claim:' || p_owner || ':' || p_action));

  if p_idempotency_key is not null then
    select * into existing
      from public.api_key_events e
     where e.key_id = p_key_id and e.idempotency_key = p_idempotency_key;
    if found then
      return query select 'duplicate'::text, existing.id, existing.result, existing.agent_id;
      return;
    end if;
  end if;

  select count(*) filter (where e.created_at >= now() - interval '24 hours'),
         count(*) filter (where e.created_at >= now() - interval '1 hour')
    into used_day, used_hour
    from public.api_key_events e
   where e.owner = p_owner
     and e.action = p_action
     and e.result in ('pending', 'ok')
     and e.created_at >= now() - interval '24 hours';

  if used_day >= p_day_limit then
    return query select 'day_limit'::text, null::bigint, null::text, null::uuid;
    return;
  end if;
  if p_hour_limit is not null and used_hour >= p_hour_limit then
    return query select 'hour_limit'::text, null::bigint, null::text, null::uuid;
    return;
  end if;

  insert into public.api_key_events (key_id, owner, action, result, idempotency_key)
  values (p_key_id, p_owner, p_action, 'pending', p_idempotency_key)
  returning id into new_id;
  return query select 'claimed'::text, new_id, 'pending'::text, null::uuid;
end;
$$;

-- Records how a claimed action ended. A failed action keeps its Idempotency-Key, so a
-- retry with the same key returns the same error instead of running twice.
create function api_key_settle(p_event_id bigint, p_result text, p_agent_id uuid, p_detail text) returns void
language sql
set search_path = ''
as $$
  update public.api_key_events
     set result = p_result, agent_id = p_agent_id, detail = left(p_detail, 200)
   where id = p_event_id and result = 'pending';
$$;

revoke execute on function public.api_key_claim(uuid, text, text, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.api_key_settle(bigint, text, uuid, text) from public, anon, authenticated;
grant execute on function public.api_key_claim(uuid, text, text, integer, integer, text) to service_role;
grant execute on function public.api_key_settle(bigint, text, uuid, text) to service_role;
