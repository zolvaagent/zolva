-- Trench exit v2 (owner 2026-11-18, "Yes, send both"; Research's trench-exit-review-2026-11-18.md).
-- stop_hits: one-minute closes in a row at or below the stop (the stop needs N of them).
-- exit_kind / exit_mcap / high_mcap / reentries: how a position ended and at what market cap, the
-- highest market cap seen while held, and how often the token was bought again (one re-entry, after a
-- flow or time exit only). Written by the runner (service role) like every other trench column.
alter table trench_positions add column stop_hits smallint not null default 0;
alter table trench_positions add column exit_kind text check (exit_kind in ('stop', 'lock', 'red', 'flow', 'graduation', 'time', 'trail', 'ladder', 'halt'));
alter table trench_positions add column exit_mcap double precision;
alter table trench_positions add column high_mcap double precision;
alter table trench_positions add column reentries smallint not null default 0;
