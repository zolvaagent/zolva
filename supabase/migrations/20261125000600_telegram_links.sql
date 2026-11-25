-- Wallet Guardian alerts on Telegram (owner 2026-11-25: "saya ingin zolva guard to telegram dulu", then
-- "Ya, bangun"). An account links one Telegram chat: /guardian hands out a one-time code (15 minutes) as a
-- t.me/<bot>?start=<code> link, the bot's webhook (/api/telegram/webhook) matches it and stores the chat.
-- Alerts then go to that chat as well as in the app. /stop in the chat or Disconnect on /guardian unlinks.

create table telegram_links (
  owner            text primary key references wallets (address) on delete cascade,
  -- Private chat id from Telegram; null while only a code is pending or after unlinking.
  chat_id          bigint unique,
  link_code        text unique check (link_code is null or link_code ~ '^[A-Za-z0-9_-]{16,64}$'),
  code_expires_at  timestamptz,
  linked_at        timestamptz,
  updated_at       timestamptz not null default now()
);
alter table telegram_links enable row level security;
