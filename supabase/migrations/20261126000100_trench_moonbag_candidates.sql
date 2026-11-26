-- Trench work approved by the owner 2026-11-26 ("ya semua"):
-- 1. House agents and the moonbag exit. A house agent (Zolva's own money, e.g. @vyz1) trades its stored rules,
--    which may use Research's exit v3 "moonbag" (no stop; lib/trench/rules.ts parseTrenchRules allows it only
--    for house agents). Every position now keeps its token's launch time for the moonbag's 7-day limit.
-- 2. Candidate log, part 1 of the supervised self-improvement loop (docs/trench-self-improvement-design.md):
--    every token the minute scan saw, bought or not, its verdict under Curve Rider's entry, the inputs, and its
--    forward path. It records only; nothing here changes a rule.

alter table trench_agents add column house boolean not null default false;
alter table trench_positions add column launched_at timestamptz;

create table trench_candidates (
  token          text primary key check (token ~ '^0x[0-9a-f]{40}$'),
  symbol         text not null,
  -- The rule the verdict is judged against (lib/trench/candidate-log.ts CANDIDATE_RULE).
  rule           text not null,
  launched_at    timestamptz,
  first_seen_at  timestamptz not null default now(),
  first_mcap     double precision,
  last_seen_at   timestamptz not null default now(),
  last_mcap      double precision,
  -- Highest and lowest market cap while the scan saw it.
  high_mcap      double precision,
  low_mcap       double precision,
  -- list | stats | social | unchecked | pass, and why (latest minute).
  stage          text not null check (stage in ('list', 'stats', 'social', 'unchecked', 'pass')),
  reason         text,
  inputs         jsonb,
  -- The first minute it passed every stage of the rule.
  passed_at      timestamptz,
  passed_mcap    double precision,
  -- Forward path after first seen: {"1h": {at, mcap, bonding, graduated}, "6h": ..., "24h", "72h", "7d"}.
  paths          jsonb not null default '{}'::jsonb,
  paths_done     boolean not null default false
);
create index trench_candidates_paths_idx on trench_candidates (first_seen_at) where not paths_done;
create index trench_candidates_passed_idx on trench_candidates (passed_at) where passed_at is not null;

-- Stage changes over time (the reason's numbers move every minute, so only a stage change is an event).
create table trench_candidate_events (
  id       bigint generated always as identity primary key,
  token    text not null references trench_candidates (token) on delete cascade,
  at       timestamptz not null default now(),
  stage    text not null,
  reason   text,
  mcap     double precision,
  bonding  double precision
);
create index trench_candidate_events_token_idx on trench_candidate_events (token, at);

-- Server only (service role), like every trench table.
alter table trench_candidates enable row level security;
alter table trench_candidate_events enable row level security;
