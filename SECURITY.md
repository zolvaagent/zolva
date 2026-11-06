# Security

## Reporting a problem

Please report security issues privately, not in a public issue:

- Use GitHub's **Report a vulnerability** on this repository (Security tab, private advisory), or
- Send a DM to [@zolva_agent](https://x.com/zolva_agent) on X and ask for a private channel.

Include what you found, how to reproduce it and what it could affect. We aim to answer within 3 days and to tell you when a fix ships. Please give us a reasonable time to fix it before sharing details publicly.

## Scope

- The app and APIs at `zolvaagent.app`, including the public API (`/api/public/v1`) and the MCP server (`/mcp`).
- The code in this repository.

Out of scope: rate limits on the public API and MCP server (they are deliberate), denial of service, and third party services we use (Privy, Supabase, Cloudflare, Robinhood Chain).

## How the project is set up

- The public API and MCP server are read only and need no key. They never return private agents, live (real money) agents, wallets or account data.
- Server secrets live in Cloudflare Worker secrets and a local `.dev.vars` that is never committed.
- Live trading is limited to an allowlist of wallets and signs swaps through a Privy policy that only allows approved tokens and the Uniswap router on Robinhood Chain.
