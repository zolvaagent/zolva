-- QProof shadow log (QHooks pilot, owner 2026-11-19 "Yes, build both"; docs/outreach-qhooks.md).
-- One row per token: every trench buy candidate (it passed Rushr's safety check and the agent's rules)
-- and the 7 pilot baseline tokens. The trench minute asks QHooks' free MCP tool qproof_check to queue a
-- scan (request:true), then reads the stored report on a later minute (request:false, no queue, free).
-- Log only: nothing here ever changes a buy or a sell. Written only by the server (service role).
create table trench_qproof (
  token          text primary key check (token ~ '^0x[0-9a-f]{40}$'),
  symbol         text,
  -- 'candidate': a trench agent wanted to buy it; 'baseline': the pilot's 7 tokens bought 2026-11-17.
  source         text not null check (source in ('candidate', 'baseline')),
  agent_id       uuid references trench_agents (id) on delete set null,
  first_seen_at  timestamptz not null default now(),
  -- pending: not asked yet; queued: a fresh scan was requested; ready: report stored; error: gave up.
  state          text not null default 'pending' check (state in ('pending', 'queued', 'ready', 'error')),
  requested_at   timestamptz,
  polled_at      timestamptz,
  attempts       smallint not null default 0,
  -- QHooks asked us to wait (retryAfter or HTTP 429): no new request before this.
  retry_after    timestamptz,
  -- The stored report: verdict level/label/headline, when QHooks completed it, and the raw JSON.
  level          text,
  label          text,
  headline       text,
  completed_at   timestamptz,
  report         jsonb,
  error          text
);

create index trench_qproof_state_idx on trench_qproof (state, first_seen_at);

alter table trench_qproof enable row level security;

-- Pilot baseline: the 7 PONS curve tokens the trench agents bought on 2026-11-17 (all closed at a loss).
insert into trench_qproof (token, symbol, source) values
  ('0xd893177bfe31e786b3e13734c3d7eabc6f786cb4', 'Intercept', 'baseline'),
  ('0x2c30e8e77b752bf9f945a9bf99427ee0b60c50be', 'ORRY', 'baseline'),
  ('0x97720cc1daa1ffbfa9d68f3081b2389c5dd9d67d', 'HYLIT', 'baseline'),
  ('0xf975e076a44b3ab2fb89ea8311fd025f822bcf56', 'OLVREN', 'baseline'),
  ('0xbcd104d018e94a4f1bb199340aacf365479124f0', 'ROTHERA', 'baseline'),
  ('0x872d5f4b6c765a9d6551f2cc1cdce33bab1705d5', 'TAURO', 'baseline'),
  ('0xe8d6ae09757769968d17eab44998a03e196217e7', 'HOLBRIC', 'baseline')
on conflict (token) do nothing;
