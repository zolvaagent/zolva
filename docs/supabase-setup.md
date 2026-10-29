# Supabase setup

**Status (2026-10-15): done through the Supabase connector, except the secret key.**

| | |
|---|---|
| Project | `sita`, ref `kjifgddikkofazmndlxu` |
| Org | The Vercel Marketplace org (billing through Vercel), named after the owner's account. **Not** the account that holds Loopa |
| Region | Southeast Asia (Singapore), `ap-southeast-1` |
| Plan | Free ($0/month) |
| URL | https://kjifgddikkofazmndlxu.supabase.co (already in `.dev.vars`) |

## What was applied
1. Migration `init`: `supabase/migrations/20261015000000_init.sql`. 8 tables, RLS on everywhere, `agents.mode` trigger.
2. Migration `seed_tokens`: `supabase/migrations/20261015000100_seed_tokens.sql`. 20 stock tokens.

## Checks run
- 20 tokens, 0 marked `verified_official` (manual check still to do)
- RLS enabled on all 8 tables
- Mode trigger tested: changing `paper` to `live` is blocked (test ran in a rolled-back transaction, no rows left)
- Security advisor: only INFO "RLS enabled, no policy". That is intended: every table is server-only (service role).

## Your step: the secret key
1. Open https://supabase.com/dashboard/project/kjifgddikkofazmndlxu/settings/api-keys
2. Copy the **secret** key (older projects call it `service_role`). Not the publishable / `anon` key.
3. Paste it into `.dev.vars` in the project root:
   ```text
   SUPABASE_SERVICE_ROLE_KEY=<secret key>
   ```
4. Tell Claude "key added". Claude restarts the dev server and checks `/api/health`, which should show `{ "ok": true, "tokens": 20, "candles": 0 }`.

⚠️ The secret key bypasses all database security. Keep it only in `.dev.vars`, never in chat, Figma or a screenshot.

## Notes
- Free projects pause after about a week without activity. The hourly pg_cron job (session 1.2) keeps it active.
- Another free project in this org can only be active if one stays paused; 4 older projects here are paused.
