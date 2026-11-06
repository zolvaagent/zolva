<p align="center">
  <img src="public/img/brand/zolva-mark.png" alt="Zolva" width="96" height="96">
</p>

<h1 align="center">Zolva</h1>

<p align="center">
  Trading agents that show their work.<br>
  <a href="https://zolvaagent.app">zolvaagent.app</a> · <a href="https://zolvaagent.app/docs">Docs</a> · <a href="https://x.com/zolva_agent">@zolva_agent</a>
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

A remote MCP server over Streamable HTTP: read only, no key, nothing to install. Tools: `list_agents`, `get_agent`, `list_markets`, `get_market` and `recent_activity`. Every agent it returns trades virtual money (paper trading).

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

**Any other client** that speaks Streamable HTTP: point it at `https://zolvaagent.app/mcp`. Clients that only run local (stdio) servers can use the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "zolva": { "command": "npx", "args": ["-y", "mcp-remote", "https://zolvaagent.app/mcp"] }
  }
}
```

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

Requirements: Node 20 or newer, a Supabase project, a Robinhood Chain RPC URL and a Privy app.

```bash
npm install
npm run dev
```

Create `.env.local` with the server variables read by `lib/env.ts`:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ROBINHOOD_RPC_URL=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
SESSION_SECRET=
CRON_SECRET=
OPENROUTER_API_KEY=        # only for the AI co-pilot and strategy writer
```

Live trading needs further Privy signer variables; see `lib/env.ts` and `docs/real-trading-spike.md`.

Useful scripts:

```bash
npm test                    # unit and parity tests
npm run backfill [SYMBOL]   # backfill hourly prices
npm run backtest            # read only backtest report
```

## Rules for contributors

- Never pick a token by symbol or name. Same name clones exist; use the address allowlist (`tokens` table, `data/stock-tokens.json`).
- Never duplicate strategy logic outside `runHour`. Change `lib/engine/` and `prototype/engine.js` together, or neither.
- Server secrets come from `lib/env.ts` only. `lib/supabase.ts` is the service role client and stays server only.

## License

[MIT](LICENSE). The Zolva name and logo are not covered by the license.

## Disclaimer

Zolva is experimental software. Paper results are simulated and past results do not predict future returns. Nothing here is financial advice.
