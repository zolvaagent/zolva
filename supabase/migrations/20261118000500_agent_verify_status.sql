-- The latest "Verify this agent" result per paper agent (lib/agents/verify.ts), for the README badge
-- (GET /api/public/v1/badge/verify). Replaying every public agent on each badge request is too heavy
-- for a Worker, so the hourly tick re-checks a few agents in rotation and the verify endpoint saves
-- each result it computes. Written only by the server (service role); no public access.
create table agent_verify_status (
  agent_id                uuid primary key references agents (id) on delete cascade,
  status                  text not null check (status in ('match', 'differs', 'no_history')),
  -- All hours replayed, verifiable hours that differ, and unverifiable hours that differ.
  hours                   integer not null check (hours >= 0),
  hours_differing         integer not null check (hours_differing >= 0),
  unverifiable_differing  integer not null default 0 check (unverifiable_differing >= 0),
  checked_at              timestamptz not null default now()
);

create index agent_verify_status_checked_idx on agent_verify_status (checked_at);

alter table agent_verify_status enable row level security;
