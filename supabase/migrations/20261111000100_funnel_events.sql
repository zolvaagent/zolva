-- Activation funnel (2026-11-11). After launch, most accounts signed in and never launched an
-- agent, and nothing showed where they stopped. A few named steps are recorded here: a random
-- per-browser id ties the steps before login to the ones after, and the wallet address is the
-- one we already store. No IP, no country, no user agent.

create table funnel_events (
  id          bigint generated always as identity primary key,
  event       text not null check (event in ('studio_view', 'preset_pick', 'launch_click', 'login_ok', 'launch_ok', 'first_agent_cta')),
  visitor     text not null check (visitor ~ '^[0-9a-f]{32}$'),
  owner       text,
  detail      text check (detail is null or length(detail) <= 64),
  created_at  timestamptz not null default now()
);
create index funnel_events_created_idx on funnel_events (created_at desc);
create index funnel_events_visitor_idx on funnel_events (visitor, created_at);
alter table funnel_events enable row level security;
