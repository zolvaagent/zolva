-- Trench release test (2026-11-17): wallets listed here may create trench agents while
-- new_agents_open is still false, so the owner can test with house money before anyone else.
alter table trench_settings add column test_owners text[] not null default '{}';
