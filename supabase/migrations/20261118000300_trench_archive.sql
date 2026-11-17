-- Trench agents the owner archived: closed for good and hidden from their list. Rows are kept
-- (real-money trades stay on record); an archived agent never trades again.
alter table trench_agents add column archived_at timestamptz;
