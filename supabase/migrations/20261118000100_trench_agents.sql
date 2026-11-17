-- Trench agents (release 1 of docs/rushr-integration-plan.md, owner 2026-11-17: open to all,
-- real money, each user at their own risk). A trench agent trades memecoins on PONS bonding
-- curves every minute through Rushr's trade builder, from its own Privy embedded wallet that the
-- user owns and funds; Zolva's signer acts on it under a per-agent policy. Decisions come only
-- from lib/trench/engine.ts runMinute. Everything here is written by the server (service role).

-- Global switches and caps. Off by default: nothing trades until the owner turns it on.
create table trench_settings (
  id                         smallint primary key default 1 check (id = 1),
  -- Kill switch: false stops every new buy at once (exits keep running).
  enabled                    boolean not null default false,
  -- New agents can be created in the Studio.
  new_agents_open            boolean not null default false,
  max_agent_budget_usd       numeric not null default 100 check (max_agent_budget_usd > 0),
  -- All trench agents' budgets together.
  max_total_budget_usd       numeric not null default 5000 check (max_total_budget_usd > 0),
  -- Crowding: what all Zolva agents together may hold in one token, and new buys per token per minute.
  max_token_exposure_usd     numeric not null default 200 check (max_token_exposure_usd > 0),
  max_buys_per_token_minute  smallint not null default 3 check (max_buys_per_token_minute > 0),
  max_agents_per_owner       smallint not null default 3 check (max_agents_per_owner > 0),
  updated_at                 timestamptz not null default now()
);
insert into trench_settings default values;

create table trench_agents (
  id                uuid primary key default gen_random_uuid(),
  owner             text not null references wallets (address),
  name              text not null check (char_length(name) between 1 and 40),
  preset            text not null check (preset in ('almost_bonded')),
  -- Parsed and clamped by lib/trench/rules.ts parseTrenchRules; the engine reads only this.
  rules             jsonb not null,
  budget_usd        numeric not null check (budget_usd > 0),
  -- setup: wallet, Rushr or funding still missing. halted: the total stop fired (only the owner of
  -- the agent can close it). closed: withdrawn, never trades again.
  status            text not null default 'setup' check (status in ('setup', 'active', 'paused', 'halted', 'closed')),
  wallet_address    text unique check (wallet_address is null or wallet_address ~ '^0x[0-9a-f]{40}$'),
  privy_wallet_id   text,
  policy_id         text,
  rushr_handle      text unique,
  rushr_member_id   text,
  -- The Rushr API key, AES-GCM encrypted with TRENCH_KEY_SECRET (lib/trench/crypto.ts). Never sent to a browser.
  rushr_key_enc     text,
  callouts          boolean not null default true,
  risk_accepted_at  timestamptz not null,
  halted_reason     text,
  last_run_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index trench_agents_owner_idx on trench_agents (owner, created_at desc);
create index trench_agents_status_idx on trench_agents (status);

-- One row per agent and token, kept after closing so a token is bought at most once per agent.
create table trench_positions (
  agent_id          uuid not null references trench_agents (id) on delete restrict,
  token             text not null check (token ~ '^0x[0-9a-f]{40}$'),
  symbol            text not null,
  curve             text not null,
  tokens            numeric(78, 0) not null default 0,
  tokens_bought     numeric(78, 0) not null default 0,
  cost_eth          double precision not null default 0,
  cost_usd          double precision not null default 0,
  opened_at         timestamptz not null,
  entry_bonding     double precision not null,
  high_per_token    double precision not null default 0,
  max_gain_pct      double precision not null default 0,
  ladders_done      smallint not null default 0,
  added             boolean not null default false,
  last_bonding      double precision not null,
  last_bonding_at   timestamptz not null,
  entry_dev_pct     double precision not null default 0,
  entry_top10_pct   double precision not null default 0,
  narrative         text,
  callout_id        text,
  closed_at         timestamptz,
  primary key (agent_id, token)
);
create index trench_positions_open_idx on trench_positions (token) where closed_at is null;

create table trench_trades (
  id            bigint generated always as identity primary key,
  agent_id      uuid not null references trench_agents (id) on delete restrict,
  ts            timestamptz not null default now(),
  token         text not null,
  symbol        text not null,
  side          text not null check (side in ('buy', 'sell')),
  eth           double precision not null,
  usd           double precision not null,
  tokens        numeric(78, 0) not null,
  pnl_usd       double precision,
  reason        text not null,
  tx_hash       text not null,
  fee_tx_hash   text
);
create index trench_trades_agent_idx on trench_trades (agent_id, ts desc);

create table trench_decisions (
  id        bigint generated always as identity primary key,
  agent_id  uuid not null references trench_agents (id) on delete cascade,
  ts        timestamptz not null default now(),
  token     text,
  symbol    text,
  action    text not null,
  reason    text not null
);
create index trench_decisions_agent_idx on trench_decisions (agent_id, ts desc);

-- One order per agent, minute, token and side: a retried minute can never send a second order.
create table trench_executions (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null references trench_agents (id) on delete restrict,
  minute      timestamptz not null,
  token       text not null,
  side        text not null check (side in ('buy', 'sell')),
  amount_in   numeric(78, 0) not null,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  tx_hash     text,
  error       text,
  created_at  timestamptz not null default now(),
  unique (agent_id, minute, token, side)
);

-- Per-token screening shared by every agent: the paid X and narrative checks run once per token.
create table trench_token_checks (
  token       text primary key check (token ~ '^0x[0-9a-f]{40}$'),
  symbol      text not null,
  passed      boolean not null,
  reason      text not null,
  narrative   text,
  checked_at  timestamptz not null default now()
);

-- One run per minute: the cron and any retry share this lock.
create table trench_minutes (
  minute       timestamptz primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  summary      jsonb
);

alter table trench_settings enable row level security;
alter table trench_agents enable row level security;
alter table trench_positions enable row level security;
alter table trench_trades enable row level security;
alter table trench_decisions enable row level security;
alter table trench_executions enable row level security;
alter table trench_token_checks enable row level security;
alter table trench_minutes enable row level security;
