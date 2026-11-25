<p align="center">
  <img src="public/img/brand/zolva-mark.png" alt="Zolva" width="96" height="96">
</p>

<h1 align="center">Zolva</h1>

<p align="center">
  Trading agents that show their work.<br>
  <a href="https://zolvaagent.app">zolvaagent.app</a> · <a href="https://zolvaagent.app/docs">Docs</a> · <a href="https://x.com/zolva_agent">@zolva_agent</a>
</p>

<p align="center">
  <a href="https://github.com/zolvaagent/zolva/actions/workflows/ci.yml"><img src="https://github.com/zolvaagent/zolva/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7c3aed" alt="License: MIT"></a>
  <a href="https://zolvaagent.app/docs/markets-and-prices"><img src="https://img.shields.io/badge/chain-Robinhood%20Chain%204663-c8f135" alt="Chain: Robinhood Chain 4663"></a>
  <a href="https://zolvaagent.app/docs/public-api#verify"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fzolvaagent.app%2Fapi%2Fpublic%2Fv1%2Fbadge%2Fverify" alt="Replay-verified agents"></a>
  <a href="https://registry.modelcontextprotocol.io/v0/servers?search=app.zolvaagent/zolva"><img src="https://img.shields.io/badge/MCP%20Registry-app.zolvaagent%2Fzolva-2563eb" alt="MCP Registry: app.zolvaagent/zolva"></a>
</p>

<p align="center">
  <a href="https://heyresearch.xyz/project/zolva-agent?utm_source=badge&utm_medium=readme"><img src="https://heyresearch.xyz/api/badge/zolva-agent" alt="Zolva Agent on HEY Research Lab"></a>
</p>

---

Zolva lets anyone build a no code trading agent for the tokenized US stocks, ETH and BTC on Robinhood Chain. Every hour each agent reads the latest on chain prices, decides to buy, sell or hold, and logs the reason next to every decision.

- **Paper trading for everyone.** Pick markets and a strategy (momentum, mean reversion, dip hunter, or your own rules), backtest it, then let it run.
- **Every decision on the record.** Buys, sells, holds and losses stay public on the leaderboard and the activity feed.
- **AI co-pilot, with limits.** An optional model can veto a rule signal. It never sizes trades or skips a stop loss.
- **Open data.** A read only public API and an MCP server expose agents, markets and activity.
- **Live trading (owner only for now).** The same engine can run on a real wallet with hard caps, swapping on Uniswap.

## How it works

1. **Prices.** Hourly closes are read on chain from each token's token/USDG Uniswap pool. ETH and BTC are also checked against Chainlink; a close more than 2% off is not stored.
2. **Engine.** `runHour` in `lib/engine/` is the only place decisions are made. Live ticks and backtests both call it.
3. **Tick.** A Cloudflare cron (minute 5) and a Supabase pg_cron backup (minute 7) both call `/api/cron/tick`. The tick is idempotent, so a double call does nothing.
4. **Record.** Decisions, trades, positions and equity are written to Postgres in one database function per agent hour.

## Public API and MCP

Read only, no key needed, rate limited.

| Endpoint | Returns |
| --- | --- |
| `GET /api/public/v1/agents` | Public agents with performance |
| `GET /api/public/v1/agents/{id}` | One agent: settings, equity vs holding, positions, trades and last 24 h of decisions |
| `GET /api/public/v1/markets` | Markets with the latest hourly close |
| `GET /api/public/v1/markets/{symbol}` | One market, its hourly closes and the agents trading it |
| `GET /api/public/v1/activity` | The public decision feed |

The same data is available as MCP tools at `https://zolvaagent.app/mcp`. Full reference: [zolvaagent.app/docs](https://zolvaagent.app/docs).

### Use the MCP server with your AI

A remote MCP server over Streamable HTTP: read only, no key, nothing to install. Seven tools: `list_agents`, `get_agent`, `list_markets`, `get_market`, `recent_activity`, `verify_agent` (replays an agent with the engine and checks its record) and `get_consensus` (per market, how many Tested agents are long, short or in cash). With an API key, up to 11 more tools act on your own paper agents ([zolvaagent.app/docs/mcp](https://zolvaagent.app/docs/mcp)). Every agent it returns trades virtual money (paper trading).

**Claude Code**

```bash
claude mcp add --transport http zolva https://zolvaagent.app/mcp
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json` in a project)

```json
{
  "mcpServers": {
    "zolva": { "url": "https://zolvaagent.app/mcp" }
  }
}
```

**Claude Desktop and claude.ai**: Settings, Connectors, Add custom connector, URL `https://zolvaagent.app/mcp`.

**Any other client** that speaks Streamable HTTP: point it at `https://zolvaagent.app/mcp`. Clients that only run local (stdio) servers can use the [`zolva`](https://www.npmjs.com/package/zolva) package from npm (source in `packages/zolva`), which forwards to the same URL:

```json
{
  "mcpServers": {
    "zolva": { "command": "npx", "args": ["-y", "zolva"], "env": { "ZOLVA_API_KEY": "zk_..." } }
  }
}
```

Leave `env` out for read-only use.

To check the server by hand:

```bash
curl -s -X POST https://zolvaagent.app/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_agents","arguments":{"sortBy":"vs_holding","limit":3}}}'
```

Try asking: "Which Zolva agent is beating holding by the most, and why?" More setup details: [zolvaagent.app/docs/mcp](https://zolvaagent.app/docs/mcp).

## Stack

- Next.js 16 (App Router) and Tailwind 4, deployed to Cloudflare Workers with OpenNext
- Supabase Postgres (schema in `supabase/migrations/`, applied in order)
- Privy for login and embedded wallets
- viem for on chain reads and live swaps
- Vitest for tests, including a parity test that keeps `lib/engine/` trading exactly like `prototype/engine.js`

## Project layout

```
app/              routes: site, app, docs, API, MCP
components/       UI
lib/engine/       strategies and runHour (the decision engine)
lib/prices/       on chain price reads
lib/agents/       agent planning, house agents, AI co-pilot runner
lib/live/         live trading executor and runner
lib/public-api/   public API formatting and HTTP helpers
prototype/        the original plain HTML design reference and engine
supabase/         migrations
scripts/          backfill, backtest, deploy and research scripts
docs/             product plan, findings and research notes
```

## Running locally

Requirements: Node 20 or newer (CI uses 22), a Supabase project with the migrations in `supabase/migrations/` applied in order, a Robinhood Chain RPC URL and, for email and Google login, a Privy app.

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the required values
npm run dev
```

Settings live in `.dev.vars`, not `.env.local`: the app reads them through the Cloudflare context (`lib/env.ts`), and `npm run dev` loads that file for you. `.dev.vars.example` lists every variable, what it does and which ones are optional; a blank optional value turns its feature off.

Useful scripts:

```bash
npm test                    # unit and parity tests
npx tsc --noEmit            # type check
npm run lint                # ESLint
npm run backfill [SYMBOL]   # backfill hourly prices
npm run backtest            # read only backtest report
```

## Deploying

Zolva runs on **Cloudflare Workers only**, built with OpenNext. `npm run build` and `npm start` (a plain Node server) are not a supported way to run it: settings, the hourly cron and the rate limiter all come from the Worker runtime, so a Node server starts without them.

```bash
npm run preview       # build for Workers and run it locally with wrangler
npm run deploy:prod   # build, deploy, push secrets, set the pg_cron backup, health check
```

`wrangler.jsonc` holds the Worker name, routes, cron trigger and bindings. `npm run deploy:prod` pushes the values in `.dev.vars` as Worker secrets.

## Security model

What the code enforces. This is not an audit; to report a problem, see [SECURITY.md](SECURITY.md).

- **Ownership.** An agent's owner is always the signed-in wallet or the owner of the API key, never a value from the request. Every route that changes an agent loads it by id and that owner (`ownAgent` in `lib/trench/onboard.ts`, `store.ownAgent` in the public API, `.eq("owner", …)` in `lib/agents/create.ts`). Anyone else gets "not found".
- **Trench withdrawals** go only to the agent's owner, enforced twice: the server sends to the signed-in wallet, and the agent wallet's Privy policy only allows transfers to that owner.
- **Real money wallets.** Each trench agent has its own wallet. Live spot agents trade from the owner's own wallet through Zolva's signer, limited by a Privy policy to approved tokens and the Uniswap router, with the proceeds paid back into the same wallet.
- **Database.** Queries go through the Supabase client and database functions with the service role key, which stays on the server (`lib/supabase.ts` is `server-only`). There is no raw SQL, and request input never goes into a query string.
- **Amounts.** On-chain amounts are integer token units built on the server (`parseUnits`, `bigint`). Sells are capped at the wallet's `balanceOf`.
- **AI co-pilot.** It can only veto a rule's signal. It never sizes a trade or skips a stop loss.
- **Tests.** 483 unit tests, including the engine parity test against `prototype/engine.js`. CI runs them on every push (see Checks).

## Checks

GitHub Actions runs the type check, lint and the full test suite on every push and pull request (`.github/workflows/ci.yml`). The engine parity test fails if `lib/engine/` and `prototype/engine.js` stop trading alike.

**Tests:** 52 test files, 483 tests (Vitest, `npm test`). They cover the trading engine and its parity with `prototype/engine.js`, strategy rules and the Studio, Verify replays, live order sizing and execution, trench agents and the QProof client, price ingest, the public API and MCP tools, API keys, x402 payments, the AI co-pilot limits and strategy writer, and the docs reference tables.

## Rules for contributors

- Never pick a token by symbol or name. Same name clones exist; use the address allowlist (`tokens` table, `data/stock-tokens.json`).
- Never duplicate strategy logic outside `runHour`. Change `lib/engine/` and `prototype/engine.js` together, or neither.
- Server secrets come from `lib/env.ts` only. `lib/supabase.ts` is the service role client and stays server only.

## License

[MIT](LICENSE). The Zolva name and logo are not covered by the license.

## Disclaimer

Zolva is experimental software. Paper results are simulated and past results do not predict future returns. Nothing here is financial advice.
