-- Sita: stock tokens, their hourly prices, and trading agents (paper now, live later).
-- Every table is server-only: RLS is on with no policies, so only the
-- service role (used by the Worker) can read or write.
--
-- Money and prices use plain `numeric` (no fixed scale): token quantities can
-- be tiny fractions and prices are compared exactly by the engine.

-- ---------------------------------------------------------------------------
-- Market data
-- ---------------------------------------------------------------------------

-- Allowlist of stock tokens. Never look a token up by symbol or name: same-name
-- clones exist on-chain, the address is the only trustworthy identity.
create table tokens (
  address           text primary key check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  symbol            text not null unique,
  -- The one pool every price for this token is read from (v3 address or v4 pool id).
  price_pool        text not null,
  -- First hourly candle we hold; the Forge hides tokens younger than the backtest window.
  history_start     timestamptz,
  -- Checked by hand against Robinhood's official Stock Token list.
  verified_official boolean not null default false,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Hourly USD candles, shared by the live engine and backtests so both see
-- exactly the same prices.
create table candles (
  token_address text not null references tokens (address) on delete cascade,
  -- Start of the hour, UTC.
  ts            timestamptz not null check (date_trunc('hour', ts) = ts),
  open          numeric not null,
  high          numeric not null,
  low           numeric not null,
  close         numeric not null,
  volume_usd    numeric not null default 0,
  primary key (token_address, ts)
);

-- ---------------------------------------------------------------------------
-- Users and agents
-- ---------------------------------------------------------------------------

create table wallets (
  address           text primary key check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  -- ISO country from Cloudflare's cf-ipcountry header at sign-in.
  country           text,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now()
);

create table agents (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null references wallets (address),
  name            text not null check (char_length(name) between 1 and 40),
  strategy        text not null check (strategy in ('momentum', 'mean_reversion')),
  -- { "max_position_pct": 0-100, "stop_loss_pct": 0-100 }. Validated in the app.
  params          jsonb not null,
  token_addresses text[] not null check (cardinality(token_addresses) between 1 and 3),
  start_capital   numeric not null check (start_capital > 0),
  -- Uninvested USD: virtual for paper agents, USDG in trading_wallet for live
  -- agents (synced from chain). Starts at start_capital.
  cash            numeric not null check (cash >= 0),
  status          text not null default 'active' check (status in ('active', 'paused')),
  -- paper: virtual dollars, fills simulated. live (Phase 3): real swaps from
  -- trading_wallet, recorded in executions. Set at launch and never changed:
  -- a paper track record must not turn into a live one.
  mode            text not null default 'paper' check (mode in ('paper', 'live')),
  -- Wallet a live agent trades from (the owner's embedded or connected wallet).
  trading_wallet  text check (trading_wallet = lower(trading_wallet) and trading_wallet ~ '^0x[0-9a-f]{40}$'),
  -- Last candle hour the engine processed for this agent.
  last_run_ts     timestamptz,
  created_at      timestamptz not null default now(),
  constraint agents_live_needs_wallet check (mode = 'paper' or trading_wallet is not null)
);

-- One running agent per wallet and mode: a user may run one paper agent and
-- one live agent at the same time. Paused agents don't count.
create unique index agents_one_active_per_owner on agents (owner, mode) where status = 'active';
create index agents_owner_idx on agents (owner, created_at desc);

create table positions (
  agent_id        uuid not null references agents (id) on delete cascade,
  token_address   text not null references tokens (address),
  quantity        numeric not null check (quantity > 0),
  -- Average fill price including the simulated cost, so stop losses and PnL
  -- are measured against what the agent actually paid.
  avg_entry_price numeric not null check (avg_entry_price > 0),
  primary key (agent_id, token_address)
);

-- A paper track record must never be relabelled as live (or the reverse).
create function agents_mode_is_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mode is distinct from old.mode then
    raise exception 'agents.mode cannot change after launch (agent %)', old.id;
  end if;
  return new;
end;
$$;

create trigger agents_mode_immutable
  before update of mode on agents
  for each row execute function agents_mode_is_immutable();

-- Live agents only (Phase 3): the on-chain life of one order, from the
-- engine's decision to a confirmed or failed swap. Paper agents never write
-- here. The engine decides; an executor turns the decision into a row here.
create table executions (
  id               uuid primary key default gen_random_uuid(),
  -- No cascade: real money history is kept, so an agent with executions
  -- cannot be deleted (pause it instead).
  agent_id         uuid not null references agents (id) on delete restrict,
  token_address    text not null references tokens (address),
  side             text not null check (side in ('buy', 'sell')),
  reason           text not null check (reason in ('signal', 'stop_loss')),
  -- Candle hour the decision was made on; with token and side it makes a
  -- retry of the same tick idempotent instead of a second order.
  decided_ts       timestamptz not null,
  -- What the engine asked for: token quantity for sells, USD notional for buys.
  intended_quantity numeric check (intended_quantity > 0),
  intended_usd     numeric check (intended_usd > 0),
  -- Price the decision was based on, and the reference oracle (Chainlink) price
  -- checked right before sending. Max slippage in basis points (50 = 0.5%).
  decision_price   numeric not null check (decision_price > 0),
  oracle_price     numeric check (oracle_price > 0),
  max_slippage_bps integer not null check (max_slippage_bps between 1 and 1000),
  status           text not null default 'pending'
                   check (status in ('pending', 'submitted', 'confirmed', 'failed', 'cancelled')),
  chain_id         integer not null default 4663,
  tx_hash          text unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  -- Filled in once confirmed.
  filled_quantity  numeric check (filled_quantity > 0),
  fill_price       numeric check (fill_price > 0),
  gas_used         numeric check (gas_used >= 0),
  gas_cost_usd     numeric check (gas_cost_usd >= 0),
  error            text,
  submitted_at     timestamptz,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (agent_id, decided_ts, token_address, side),
  constraint executions_amount check (intended_quantity is not null or intended_usd is not null),
  constraint executions_confirmed_has_fill check (
    status <> 'confirmed' or (tx_hash is not null and filled_quantity is not null and fill_price is not null)
  )
);

create index executions_agent_idx on executions (agent_id, created_at desc);
-- The executor's work queue: orders not finished yet.
create index executions_open_idx on executions (created_at) where status in ('pending', 'submitted');

create table trades (
  id            bigint generated always as identity primary key,
  agent_id      uuid not null references agents (id) on delete cascade,
  -- Candle hour whose close was used as the fill price.
  ts            timestamptz not null,
  token_address text not null references tokens (address),
  side          text not null check (side in ('buy', 'sell')),
  quantity      numeric not null check (quantity > 0),
  price         numeric not null check (price > 0),
  -- Paper: simulated fees + slippage (0.5% of notional). Live: real swap fees
  -- + slippage versus the decision price + gas, in USD.
  cost_usd      numeric not null check (cost_usd >= 0),
  reason        text not null check (reason in ('signal', 'stop_loss')),
  -- Live trades point at the confirmed on-chain execution; paper trades leave it null.
  execution_id  uuid unique references executions (id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index trades_agent_idx on trades (agent_id, ts desc);

-- One row per agent per processed hour: the equity curve plus the decision log.
create table agent_runs (
  id         bigint generated always as identity primary key,
  agent_id   uuid not null references agents (id) on delete cascade,
  ts         timestamptz not null,
  equity     numeric not null,
  cash       numeric not null,
  -- Per token: { action, reasoning, indicators }.
  decisions  jsonb not null,
  created_at timestamptz not null default now(),
  -- Makes a run idempotent: a duplicate tick for the same hour is rejected.
  unique (agent_id, ts)
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table tokens     enable row level security;
alter table candles    enable row level security;
alter table wallets    enable row level security;
alter table agents     enable row level security;
alter table positions  enable row level security;
alter table executions enable row level security;
alter table trades     enable row level security;
alter table agent_runs enable row level security;
