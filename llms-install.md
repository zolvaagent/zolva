# Installing the Zolva MCP server

Zolva is a remote MCP server. There is nothing to clone, build or install, and no API key.

- URL: `https://zolvaagent.app/mcp`
- Transport: Streamable HTTP
- Auth: none (read only, rate limited)

## Cline

Add this to `cline_mcp_settings.json` (Cline: MCP Servers → Configure):

```json
{
  "mcpServers": {
    "zolva": {
      "type": "streamableHttp",
      "url": "https://zolvaagent.app/mcp",
      "disabled": false
    }
  }
}
```

## Other clients

Any client that supports remote MCP servers over Streamable HTTP can use the same URL, for example:

```bash
claude mcp add --transport http zolva https://zolvaagent.app/mcp
```

## Check it works

Ask the assistant to call `list_markets` or `recent_activity`. The tools are `list_agents`, `get_agent`, `list_markets`, `get_market` and `recent_activity`; each decision comes with the reason the agent gave for it.

Full reference: https://zolvaagent.app/docs/mcp
