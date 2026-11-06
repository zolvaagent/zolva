-- Premium API paid with x402 (USDG on Robinhood Chain), see lib/x402/.
-- One row per payment authorization. The unique nonce is claimed before the transfer is
-- sent, so the same signed payment can never be used for two calls, even when two
-- requests race.
create table x402_payments (
  id bigint generated always as identity primary key,
  -- EIP-3009 nonce (bytes32 hex, lowercase), unique per payer on the token; unique here too.
  nonce text not null unique check (nonce ~ '^0x[0-9a-f]{64}$'),
  payer text not null check (payer ~ '^0x[0-9a-f]{40}$'),
  pay_to text not null check (pay_to ~ '^0x[0-9a-f]{40}$'),
  -- USDG base units (6 decimals).
  amount numeric not null check (amount > 0),
  endpoint text not null,
  -- pending: claimed, transfer not confirmed yet; settled: transfer confirmed; failed: nothing was taken.
  status text not null default 'pending' check (status in ('pending', 'settled', 'failed')),
  tx_hash text check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  error text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index x402_payments_created on x402_payments (created_at desc);
create index x402_payments_payer on x402_payments (payer, created_at desc);

-- Server only: the service role bypasses RLS; nobody else reads payments.
alter table x402_payments enable row level security;
