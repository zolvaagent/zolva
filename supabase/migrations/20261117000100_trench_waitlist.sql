-- Trenches notify list (2026-11-17, release 0 of docs/rushr-integration-plan.md): signed-in
-- users who want to know when they can create their own trench agent. One row per wallet.
-- Written only by the server (service role) from /api/trenches/notify; no public access.
create table trench_waitlist (
  owner text primary key check (owner ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now()
);

alter table trench_waitlist enable row level security;
