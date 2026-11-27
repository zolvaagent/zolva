-- Rules fingerprint (lib/agents/fingerprint.ts): the SHA-256 of an agent's trading settings,
-- written when the agent is made (older agents: once, by scripts/backfill-rules-hash.mts).
--
-- The hash is write-once and the database stamps the time itself, so a later settings change shows
-- as a mismatch instead of a new hash, and a hash cannot be backdated by the app.
--
-- Run before deploying the app: it selects and inserts these columns.

alter table agents add column rules_hash text check (rules_hash ~ '^[0-9a-f]{64}$');
alter table agents add column rules_hash_at timestamptz;

create or replace function agents_keep_rules_hash() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.rules_hash is not null then
    new.rules_hash := old.rules_hash;
    new.rules_hash_at := old.rules_hash_at;
  else
    new.rules_hash_at := case when new.rules_hash is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger agents_rules_hash
  before insert or update on agents
  for each row execute function agents_keep_rules_hash();
