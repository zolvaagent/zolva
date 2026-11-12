-- Once an agent has been published, its record stays public. Unpublishing only takes it off the
-- leaderboard, markets and the activity report; its page (settings, trades, decisions, losses
-- included) keeps working for everyone, so a bad result cannot be hidden after the fact.
--
-- first_published_at is set the first time published_at is set and can never be cleared again:
-- the trigger restores it on every update, whatever the update says.

alter table agents add column first_published_at timestamptz;

update agents set first_published_at = published_at where published_at is not null;

create or replace function agents_keep_first_published() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.first_published_at := coalesce(old.first_published_at, new.published_at);
  else
    new.first_published_at := new.published_at;
  end if;
  return new;
end;
$$;

create trigger agents_first_published
  before insert or update on agents
  for each row execute function agents_keep_first_published();
