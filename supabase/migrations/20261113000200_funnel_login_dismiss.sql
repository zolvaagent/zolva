-- Funnel (2026-11-13): 13 of 15 logged-out visitors who pressed Launch in the Studio never
-- finished the login. login_dismiss records the login window being closed without a login, with
-- where it opened and which option was tried, so the login step can be measured.

alter table funnel_events drop constraint funnel_events_event_check;
alter table funnel_events add constraint funnel_events_event_check
  check (event in ('studio_view', 'preset_pick', 'launch_click', 'login_ok', 'login_dismiss', 'launch_ok', 'first_agent_cta'));
