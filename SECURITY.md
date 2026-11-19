# Security

## Reporting a problem

Please report security issues privately, not in a public issue:

- Use GitHub's **Report a vulnerability** on this repository (Security tab, private advisory), or
- Send a DM to [@zolva_agent](https://x.com/zolva_agent) on X and ask for a private channel.

Include what you found, how to reproduce it and what it could affect. We aim to answer within 3 days and to tell you when a fix ships. Please give us a reasonable time to fix it before sharing details publicly.

## Scope

In scope:

- The app and APIs at `zolvaagent.app`: the public API (`/api/public/v1`), API keys and the `/me` endpoints, the MCP server (`/mcp`) and the paid x402 endpoints (`/api/x402/v1`).
- Real money: live agents, trench agents and their wallets.
- The code in this repository.

Out of scope: rate limits on the public API and MCP server (they are deliberate), denial of service, social engineering, and third party services we use (Privy, Supabase, Cloudflare, Rushr, Robinhood Chain). Report problems in those to their owners; tell us if one affects Zolva.

## How access works

**Without a key.** The public API and MCP server read published paper agents and markets. They never return private agents, real money agents, wallets or account data.

**API keys.** A signed-in user makes keys in Settings, at most 5 per account. A key is shown once; only its SHA-256 hash is stored. It acts for its owner only: every request is checked against the key owner, never against an id or address in the request. A key carries only the scopes picked when it was made:

| Scope | What it allows |
|---|---|
| `read:private` | Read your own agents, private and real money ones included |
| `compute` | Check rules and run backtests |
| `ai` | Write strategies with AI and change AI limits; spends your AI credits |
| `agents:write` | Create, pause, resume, publish and unpublish your **paper** agents |
| `live:stop` | Pause your real money agents. Nothing else with real money |

Keys made from blocked countries can only read and backtest. A key can be revoked at any time in Settings.

**MCP actions.** With a key, the MCP server can act for its owner: backtest, create, pause, resume, publish and unpublish paper agents, write strategies and set AI limits. The only real money action is `pause_live_agent`, which can stop a real money agent and nothing more. No key can place a live order, swap, withdraw or create a real money agent.

## Real money

- **Live spot agents** trade from the owner's own wallet. The owner adds Zolva's signer under a Privy policy that only allows approving the Uniswap router and swapping allowlisted tokens on Robinhood Chain, with the proceeds paid back into the same wallet. The owner can pause the agent or remove the signer at any time. Global caps apply (capital per agent and daily volume).
- **Trench agents** each get their own wallet. Its Privy policy only allows, on Robinhood Chain: PONS curve buys and sells paid to that wallet, the Uniswap Universal Router with a cap per transaction, token approvals, Rushr's trade fee (capped), and transfers of ETH or tokens to the owner. Withdrawals go only to the owner: the server sends to the signed-in wallet, and the policy blocks any other address.
- On-chain amounts are integer token units built on the server, and sells are capped at the wallet's balance.

## How the project is set up

- An agent's owner is always the signed-in wallet or the API key's owner, never a value from a request. Every route that changes an agent loads it by id and that owner. See the README's "Security model" for where this lives in the code.
- Database access goes through the Supabase client and database functions with the service role key, which stays on the server. There is no raw SQL, and request input never goes into a query string.
- Server secrets live in Cloudflare Worker secrets and a local `.dev.vars` that is never committed.
- The AI co-pilot can only veto a rule's signal; it never sizes a trade or skips a stop loss.
- CI runs the type check, lint and tests on every push. New commits are signed.

This describes how the code is meant to work. It is not an audit.
