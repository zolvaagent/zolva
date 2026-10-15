-- Users may run several agents at once (decided 2026-10-15), replacing the
-- earlier "one active agent per owner and mode" unique index.
--
-- Limits per owner: 5 active paper agents, 1 active live agent. The cap keeps
-- the leaderboard meaningful (launching 50 random agents would let one top it
-- by luck) and keeps live trading cautious. Paused agents never count.
--
-- An advisory lock per owner serialises the check, so two launches at the same
-- moment cannot both slip under the limit.

drop index if exists agents_one_active_per_owner;
create index if not exists agents_owner_active_idx on agents (owner, mode) where status = 'active';

create function agents_active_limit(agent_mode text) returns integer
language sql
immutable
set search_path = ''
as $$
  select case agent_mode when 'live' then 1 else 5 end;
$$;

create function enforce_active_agent_limit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_count integer;
  allowed integer := public.agents_active_limit(new.mode);
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

create trigger agents_active_limit
  before insert or update of status, owner, mode on agents
  for each row execute function enforce_active_agent_limit();
