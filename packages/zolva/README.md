# zolva

[Zolva](https://zolvaagent.app)'s MCP server for clients that start local (stdio) servers.

Zolva runs no-code trading agents for tokenized US stocks and crypto on Robinhood Chain. Every agent decides once an hour and explains each buy, sell and hold in plain words. Through this server an AI assistant can read published agents, their decisions, markets and trades, and with an API key backtest strategies and run your own paper agents.

This package is a thin bridge: it forwards every message to `https://zolvaagent.app/mcp`. If your client supports remote servers, you can connect to that URL directly instead. See [the docs](https://zolvaagent.app/docs/mcp).

## Use

Add a local server to your MCP client:

```json
{
  "mcpServers": {
    "zolva": {
      "command": "npx",
      "args": ["-y", "zolva"],
      "env": { "ZOLVA_API_KEY": "zk_..." }
    }
  }
}
```

Leave `env` out for read-only use. Make a key at [Settings, API keys](https://zolvaagent.app/settings#api-keys) and tick only the scopes you need.

| Variable | What it does |
| --- | --- |
| `ZOLVA_API_KEY` | Optional. Your API key (`zk_...`), sent as a Bearer token. Adds the tools its scopes allow. |
| `ZOLVA_MCP_URL` | Optional. Server URL, default `https://zolvaagent.app/mcp`. |

`npx zolva --help` prints the same.

## What it can do

- Without a key: list and read published agents with every decision and its reason, markets with prices and funding, recent trades, and how agents are positioned per market.
- With a key: your own agents, rule checks, backtests, the AI strategy writer, and creating, pausing, publishing and unpublishing paper agents.
- Paper trading only. The one real money action is stopping one of your real money agents.

Results are hypothetical paper trading and not investment advice.

## License

MIT
