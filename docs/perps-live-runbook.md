# Perps live on Lighter RH: runbook (owner only)

Step P of [plan-actions-perps-live.md](plan-actions-perps-live.md). Built on 2026-11-15 (P0 to P2). Nothing below is live until every step is done in order.

## What is built
- **The zolva-lighter Worker** (`workers/lighter/`):
  - The only place that holds Lighter API keys. It signs orders with Lighter's official WASM signer (lighter-go v1.0.12, pinned by sha256, downloaded by `npm run lighter:signer`).
  - It sends orders and confirms each fill from the account's position.
  - It has no public route. The main Worker reaches it through a service binding.
  - Kill switch: `LIGHTER_ENABLED`.
- **The perps live runner** (`lib/live/perps-runner.ts`), every hour, for live agents that Zolva gave a Lighter sub-account:
  1. Copy positions and cash from Lighter. If they differ from Zolva's record, pause the agent.
  2. Decide on the newest hour with the same engine as paper (`runHour`).
  3. Send orders through zolva-lighter: risk-reducing orders first, new risk within the daily cap.
  4. Copy from Lighter again.
- **Migration `20261115000100_perps_live.sql`** (not applied):
  - `agents.lighter_account_index`
  - Lighter columns on `executions`
  - the guard: perps can be live only with a Lighter account, and live perps stay at 1x
  - `sync_lighter_agent` and `apply_lighter_fill`
- **Key helper** (`npm run lighter:register`): one wallet signature registers Zolva's key on a Lighter account. The key goes into a gitignored file and is never printed.

Checked:
- Unit tests for the order math, the handler, and the runner.
- The signer runs in workerd.
- A signed order sent to Lighter's testnet was accepted in format (refused only because the throwaway key was not registered).
- The main site still builds.

## Before any money (owner)
1. **Read Lighter's terms** and confirm your country is allowed. Singapore and the usual list are excluded.
2. **Use a new wallet only for this**: not your personal wallet, and not 0x235c…f628. Put a little ETH (gas) and USDG on Robinhood Chain in it.
3. **The gate:**
   - the agent's paper twin has at least 3 weeks of paper hours after its rule was frozen
   - its return is above holding
   - its worst drop is within the limit
   - for the Vol Trend alts that is about early December
4. **Size, honestly:**
   - Lighter refuses orders under **$10**.
   - With volatility sizing at 20%, an agent holds about 15–25% of its deposit, so a $50 deposit buys a $10 position at best, and its daily resizes are under $10 and get skipped.
   - Useful sizes start around **$150–250 per agent**. That is above today's live cap (`live_settings.max_agent_capital_usd` = $100), so it is your decision to raise the cap or wait.

## Go live, in this order
| # | Who | Step |
|---|---|---|
| 1 | Owner | Open a Lighter RH account with the new wallet, deposit, and create one sub-account per agent. |
| 2 | Dev + owner | `npm run lighter:signer`, then `npm run lighter:register -- --network mainnet --address 0xNEWWALLET --account <sub-account>`. The owner presses the button and signs once. |
| 3 | Dev | `npm run lighter:deploy` (vars set to mainnet: `LIGHTER_API=https://api.rh.lighter.xyz`, `LIGHTER_CHAIN_ID=466324`, `LIGHTER_ENABLED=false`). Secrets: `INTERNAL_TOKEN`, `LIGHTER_KEYS`. |
| 4 | Dev | Apply the migration. Add the service binding `{ "binding": "LIGHTER", "service": "zolva-lighter" }` to `wrangler.jsonc`, set the `LIGHTER_INTERNAL_TOKEN` secret on the main Worker, and deploy. **The binding must only be added after zolva-lighter exists, or the main deploy fails.** |
| 5 | Dev | Create the live perps agent with its `lighter_account_index`, under its own Lab owner (one live agent per owner). Set 1x isolated with `POST /leverage`. |
| 6 | Owner | Approve turning `LIGHTER_ENABLED` to "true". Watch the first ticks: the tick JSON shows `perps`, and the agent page shows the trades. |

## Stop
- Everything: set `LIGHTER_ENABLED` to anything but "true" on zolva-lighter (no orders), or `live_settings.enabled = false` (no live agents at all).
- One agent: pause it on its page.
- Funds: withdraw from Lighter to your own wallet. An API key can only withdraw there.
