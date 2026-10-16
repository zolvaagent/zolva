# Zolva (folder: pitwise)

Brand is **Zolva**; internal names (folder, package, Workers) still say `pitwise`.

No code paper-trading agents for tokenized US stocks on Robinhood Chain.

Read before working: `docs/mvp-plan.md`, `docs/tasks.md`, `docs/phase-0-findings.md`.

## Stack
- Next.js 16 (App Router) + Tailwind 4, deployed to Cloudflare Workers via OpenNext
- Supabase Postgres; schema in `supabase/migrations/` (run in order)
- Hourly job: Cloudflare cron (minute 5, `custom-worker.ts`) and Supabase pg_cron backup (minute 7) both call `/api/cron/tick`; the tick is idempotent
- Code: private repo `github.com/zolvaagent/zolva`. Commit only as `Zolva` (set in this repo's git config); never with a personal name or email, and never with a `Co-Authored-By: Claude` line. Push with the `zolvaagent` gh account active
- Deploy: `npm run deploy:prod` (build, deploy, secrets, pg_cron, health check)
- Prices: hourly closes read on chain from each token's stock/USDG Uniswap pool (`lib/prices/onchain.ts`, needs `ROBINHOOD_RPC_URL`). GeckoTerminal (network `robinhood`) only for the historical backfill and best-effort candle repair; it rate-limits Cloudflare IPs, throttle to ~1 call every 7s

## Rules
- Never pick a token by symbol or name: same-name clones exist. Use the address allowlist (`tokens` table, `data/stock-tokens.json`).
- Server secrets come from `lib/env.ts` only; `lib/supabase.ts` is the service-role client and must stay server-only.
- `prototype/` is the approved design reference (plain HTML). The real engine lives in `lib/engine/`; a Vitest parity test keeps it trading exactly like `prototype/engine.js`, so change both together or neither.
- AI co-pilot (`lib/ai`, `lib/agents/copilot-runner.ts`): may only veto rule signals through `runHour`'s `veto` option; never let it size trades or skip stop losses. Every model call is claimed and settled in the database (`ai_claim` / `ai_settle`) and paid from `ai_credits`. The Studio strategy writer (`lib/ai/strategy-writer.ts`, `/api/strategy/generate`) only produces rules that pass `parseRules`; its calls go through `ai_generation_start` / `ai_generation_settle`
- Engine rule: `runHour` is the only place decisions are made. Live ticks and backtests both call it; never duplicate strategy logic elsewhere.
- Scripts: `npm run backfill [SYMBOL...]` (prices), `npm run backtest` (read-only report), `npm test`.
