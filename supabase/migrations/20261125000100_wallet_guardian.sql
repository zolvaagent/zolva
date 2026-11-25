-- Wallet Guardian (owner 2026-11-24): read-only watch of the Stock Tokens in a user's own wallets.
-- A guard is a stop loss (and optional take profit) on one token in one wallet the account owns
-- (its login wallet or a verified wallet). Every hour lib/guardian/runner.ts reads the balance on
-- chain and runs the engine's runHour on it with every buy vetoed; when the rules would sell, it
-- writes one alert and the guard stops alerting until the user re-arms it. Zolva never trades or
-- holds funds here: the user sells from /swap themselves. Alerts are in-app only for now.

create table guardians (
  id               uuid primary key default gen_random_uuid(),
  owner            text not null references wallets (address) on delete cascade,
  -- Lowercase address of the watched wallet: the owner's own or one of their verified_wallets.
  wallet           text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  token_address    text not null references tokens (address),
  -- The price the stop loss and take profit are measured from (USD). Defaults to the price when
  -- the guard was set; the user can change it to what they paid.
  basis_price      double precision not null check (basis_price > 0),
  stop_loss_pct    double precision not null check (stop_loss_pct > 0 and stop_loss_pct <= 90),
  take_profit_pct  double precision check (take_profit_pct is null or (take_profit_pct > 0 and take_profit_pct <= 1000)),
  status           text not null default 'armed' check (status in ('armed', 'triggered')),
  -- Last hour checked (start of the hour), so a rerun of the tick never checks the same hour twice.
  checked_hour     timestamptz,
  triggered_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (owner, wallet, token_address)
);
create index guardians_armed on guardians (status) where status = 'armed';
alter table guardians enable row level security;

create table guardian_alerts (
  id             bigint generated always as identity primary key,
  guardian_id    uuid not null references guardians (id) on delete cascade,
  owner          text not null references wallets (address) on delete cascade,
  wallet         text not null,
  token_address  text not null references tokens (address),
  kind           text not null check (kind in ('stop_loss', 'take_profit')),
  -- The hourly close that triggered it, the basis it was measured from, and the balance then.
  hour           timestamptz not null,
  price          double precision not null,
  basis_price    double precision not null,
  quantity       double precision not null,
  reasoning      text not null,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),
  -- One alert per guard per hour, so a rerun of the tick cannot alert twice.
  unique (guardian_id, hour)
);
create index guardian_alerts_unread on guardian_alerts (owner, created_at desc) where read_at is null;
create index guardian_alerts_owner on guardian_alerts (owner, created_at desc);
alter table guardian_alerts enable row level security;
