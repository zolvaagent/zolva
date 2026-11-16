# Outreach: Autonomo (x402 launchpad and directory on Robinhood Chain)

Checked 2026-11-15. Owner asked: "cek bisakah kolaborasi dengan project ini https://autonomo.fun/". Draft only: the owner sends the DM and submits any listing form.

## What Autonomo is
- Site https://autonomo.fun (Next.js, JS-rendered; https://autonomo.fun/llms.txt is the readable version). X @useautonomo (created 2026-10-28, ~450 followers, posts daily dev logs, 600 to 2.3K views a post). Telegram t.me/autonomodotfun.
- "The agentic x402 launchpad and directory". Two halves:
  - **Launchpad / hosted gateway**: paste an API URL, set a price, agents pay per call over x402 **v2** (`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE`; `X-PAYMENT` also accepted) in USDG or $AUTONOMO on **Robinhood Chain (eip155:4663)**. Provider keeps 95%, 5% buys back and burns $AUTONOMO. Free to launch.
  - **Directory**: 5.1K x402 projects, 128.6K paid endpoints across 13 networks, imported from Coinbase CDP and PayAI Bazaar catalogs every 3 days. Plus a manual listing form for self-hosted x402 APIs (reviewed by hand; "APIs with a live 402 endpoint go fastest").
- 8+ official APIs of their own, all Robinhood Chain on-chain reads (new launches, token risk, holders/bundles, dev wallet, wallet portfolio, tx explainer, payment check, gas, endpoint health), 0.005 to 0.01 USDG a call.
- Agent tools: MCP server (`npx -y autonomo-mcp`: find_apis, get_price, call_api), SDK (npm `autonomo-sdk` 0.1.3, PyPI `autonomo`), CLI, LangChain tools, an Agent Playground and a Telegram bot. Free discovery JSON API: `/api/v1/gateways`, `/api/v1/projects?q=`, `/api/v1/stats`.
- Robinhood Chain partners already wired: Ostra (vault agents pay Autonomo APIs), Gloam (private payments), Borro (credit lines). No GitHub repo found (npm maintainer `autonomodotfun`).

## Touches Robinhood Chain / stocks?
- Yes, chain-native on Robinhood Chain, paid in USDG, same as our premium API.
- Tokenized stocks: not yet. Their roadmap "Coming next" lists **"Grants for outside APIs, starting with tokenized stock data"**. That is exactly our data. Directory search for "stock" today returns only Base-network equity APIs (Stock Trends, Stock Value Lens…); nothing for Robinhood Chain stock tokens. Search for "zolva" returns 0.

## Token
- $AUTONOMO, CA `0xe83c85e1ead16fcfe85401e2b337fb4fb5b5cc96` (18 decimals, on Robinhood Chain; "the only official address", shown on every page).
- Used to pay APIs, for the 5% burn, and for a **Verified** badge: a provider holds about $27 of $AUTONOMO in the payout wallet. Optional; it costs money and it is a holding badge, not a review. Skip.

## Team and red flags
- Team anonymous; no names found. Account and project ~18 days old.
- Plus: ships fast and transparently (on-chain burn receipts with addresses, public roadmap, plain-word docs). Handled a reported SDK security bug (HEY Research, Borro path) in public on 2026-11-14 with a fixed release. narcdbot scored it "PARTLY REAL 60/100" on 2026-11-12 (app works, live backend), mostly for being new.
- Watch: token project, so keep our wording to "listed", no token mentions, no price talk. Never hold or buy $AUTONOMO for the badge without the owner's yes. Their SDK can sign payments from an agent wallet: if we ever test it, use a fresh wallet with cents, never a main key.

## Fit with Zolva
- **Distribution channel + likely data buyer, not a competitor.** They sell APIs to agents; they do not run trading agents or backtests.
- Our premium API is x402 **v1** on Robinhood Chain in USDG (`/api/x402/v1/scan` 0.02, `/api/x402/v1/backtest` 0.03; lib/x402/catalog.ts). Their directory takes self-hosted x402 APIs through the listing form, and their gateway accepts `X-PAYMENT`, so a self-hosted listing is the natural path. Caveat to check: their tools (MCP, SDK) build v2 payments; whether they pay a v1 self-hosted endpoint is unknown. Ask in the DM.
- Their roadmap wants tokenized stock data from outside providers. We already read every Robinhood Chain stock token's hourly close on chain. Our scan endpoint is that data, ready.
- Hosted gateway route: not needed (we already charge ourselves; their gateway would add a 5% burn split). Skip.

## Verdict
Worth it. Low cost, same chain, same payment rail, and they publicly asked for tokenized stock data.

## Cheapest real step
1. Owner submits the self-hosted listing form on autonomo.fun (website + paid endpoint `https://zolvaagent.app/api/x402/v1/scan`, plus `/backtest`). Reuse the listing data in `docs/outreach-x402fi.md` ("Listing data"). Free.
2. Then DM @useautonomo (can DM: yes) with the line below.
3. Optional, cents: call their free `/api/v1/projects?q=zolva` after review to confirm it shows. Running their Endpoint Health on our scan URL (0.005 USDG) would show whether their tools read our v1 402; ask the owner first since it spends money.

## DM draft (owner sends)
> Hey Autonomo team, love the daily dev logs. We run Zolva (zolvaagent.app): paper-trading agents for Robinhood Chain stock tokens, ETH and BTC. Our premium API already speaks x402 on Robinhood Chain in USDG, so we just sent it through your listing form: an hourly scan of every stock token (price, z-score, RSI, trend) plus strategy backtests. Saw "tokenized stock data" on your roadmap, happy to help there. One q: do your MCP/SDK pay x402 v1 endpoints (X-PAYMENT)?

Shorter:
> Hey! Zolva here (zolvaagent.app). Our x402 API on Robinhood Chain sells hourly stock token data + backtests in USDG, just submitted it via your listing form. Saw tokenized stock data on your roadmap, happy to help. Do your tools pay x402 v1 (X-PAYMENT)?

**Short DM with the verify line (2026-11-16, use this one):**
> Hey! Zolva here (zolvaagent.app). Our x402 API on Robinhood Chain sells hourly stock token data + backtests in USDG, just submitted it via your listing form. Every agent's log can be re-checked too: the engine replays it against stored prices (/api/public/v1/agents/{id}/verify, MCP verify_agent). Saw tokenized stock data on your roadmap, happy to help. Do your tools pay x402 v1 (X-PAYMENT)?

## Status
- [ ] Owner submits the listing form (self-hosted, scan + backtest)
- [ ] Owner sends the DM to @useautonomo
- [ ] After review: check `https://autonomo.fun/api/v1/projects?q=zolva`
