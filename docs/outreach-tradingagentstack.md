# Outreach: TradingAgentStack (directory + safety score for trading tools)

Checked 2026-11-15. Inbound X DM from @Satovinci on 2026-11-14 21:56. Draft only: the owner replies and submits the listing.

## The ask
1. List Zolva in their directory (free).
2. "Both of us speak x402": our agents pull their verified track records, and they link our backtests from their site.

## Who
- **@Satovinci** (Ahsen; llms.txt says Ahsen Rajab): X since 2024-01, 4,827 followers, blue check (paid, not org verified). Bio: checks what AI trading bots, agents and vaults actually made, from the chain. Trading since 2017. Posts daily, data-led and honest in tone ("losers stay on the board", "+227% is a description of risk, not skill"). Low engagement (100-600 views, few likes). Also reached out to @MerrymenAI the same way on 2026-11-08, so this is a standard listing outreach.
- **@tradingAgentStk** (site account): created 2026-10-16, 8 followers.
- Site launched 2026-10-15/16 (one month old). One named operator, no company named.

## What the site is
- https://tradingagentstack.com: 172 tools in 19 categories (broker MCP servers, bot platforms, AI trading agents, risk/safety and paper trading...), a Strategy Lab of 182 open-source bots on paper money, vault and copy-trader boards, incident tracker.
- Some pull: tastytrade posted its "Highest Rated MCP Server for Safety Controls" badge from them (2026-10-27, 2.7K views).
- Robinhood Chain already appears: Arcus, Gloam, Robinhood Trading MCP. **Zolva is not listed** (search of home, /tools, /ai-trading-agents, llms-full.txt; partial reads).

## How a listing works
- Free, via the form at https://tradingagentstack.com/submit/ (or email). For a new tool they want: **name, official site, and in the notes what it trades and whether it has a paper or demo mode**. Email optional (reply within 2 working days). Exact form labels not visible to the fetcher; check on the page.
- Listing criteria include: someone is named as running it, a published price, docs say how it reaches your money. Paper mode not required.
- **Paid upsells exist** (advertise page): Featured listing $149/30 days, Strategy Lab test $249, home slot $300/month, agent track-record report $500, launch pack $1,000; paid in USDC on Base. They say sponsorship never changes scores. **We take none of these.** Expect a pitch on the call; answer "free listing only for now".

## Safety score (0-100%)
Seven inputs from vendor docs: Human approval 25 · Guardrails outside the agent 15 · Test before real money 15 · Sending funds out 15 · Who holds the keys 10 · Open source or audited 10 · Incidents (12 months) 10. Undocumented inputs drop out of the max ("partial"). An unresolved incident caps at 49%. Crypto AI agent tools "always count as able to move money".

"Who places the order" values seen: "Can trade unattended", "Approval is optional", "Need you to confirm each order", "Can't place real-money orders".

**Likely Zolva score (our estimate, not theirs):** Alpaca Paper Trading scores 90% with "Can't place real-money orders". Zolva, described as paper trading with a public repo, should land around 90-100%. Risk: if they file us as a crypto "AI trading agent", the move-money rule applies and the score drops. So ask for the **Risk/safety & paper trading** category, and be upfront that a small invite-only real-money mode exists outside the MCP and API (better they read it from us than find it and mark an incident).

## Their MCP and x402
- MCP: `https://tradingagentstack.com/api/mcp` (streamable HTTP, free, read-only, no key), 11 tools incl. `get_track_record` (Hyperliquid vaults, Lighter pools, dHEDGE, approved AI agents) and `check`. Records are signed (ES256).
- x402: `GET https://tradingagentstack.com/api/x402?query=...`, **$0.01 per call in USDC on Base**, Coinbase facilitator. Same JSON as the free `check` tool. Version (v1 or v2 headers) not stated.
- **Ours:** x402 **v1**, USDG on **Robinhood Chain** (`robinhood` / `eip155:4663`), scan 0.02, backtest 0.03 (`/docs/premium-api`). So "both speak x402" is true, but **different chain and asset**: neither side can pay the other with what it already holds.

## Verdict
**(a) Listing: yes.** Free, on-topic (safety-first trading tools), the operator's tone matches ours, and the score method rewards exactly what Zolva has (paper, confirm step, no custody, open source). Low reach for now (8-follower site account), so low effort only.

**(b) x402 cross-linking: later, details first.**
- "Our agents pull verified records from them" = Zolva paying USDC on Base per call and new code in our agents. That is Development's work, costs money, and their free MCP already returns the same data. Not now; needs the owner's yes.
- "They link our backtests": cheap and fine. Simplest form: they link our public agent pages / `/docs/premium-api`, or call our free public API. No build from us.
- Track record on their site: they verify AI agents via an ERC-8004 id (we have #25650) and a person confirms. Our records are paper, so they must be labelled paper, never "verified returns". Optional, owner's call.

## Listing draft (for /submit/)
- **Name:** Zolva
- **Official site:** https://zolvaagent.app
- **Category (ask for):** Risk/safety & paper trading (or AI trading agents, marked paper)
- **Notes:**
  > Zolva runs no-code paper-trading agents for tokenized US stocks, ETH and BTC on Robinhood Chain (plus research agents on Lighter perps, paper only). Every agent trades virtual money, decides once an hour and explains each trade in plain words. Paper mode is the product: there is nothing to deposit and no wallet to connect.
  >
  > MCP: remote, https://zolvaagent.app/mcp (official MCP Registry: app.zolvaagent/zolva 1.1.0). Without a key: 5 read-only tools. With an API key: 16 tools, which act on that account's paper agents only. Creating or publishing an agent is two steps: a preview first, then confirm. Nobody places real orders through the MCP; the only real-money action is pause_live_agent, which can only stop an agent. A small invite-only real-money mode exists but is not reachable through the MCP or the public API.
  >
  > Guardrails live in the engine, not the model: stop loss and position caps are rules; the optional AI co-pilot can only veto a rule signal, never size a trade or skip a stop. Code is public: github.com/zolvaagent/zolva. ERC-8004 agent #25650. Price: free; a premium API (scan, backtest) is pay-per-call over x402 in USDG on Robinhood Chain. Results are hypothetical.
- **Email (optional):** owner's choice of contact address
- **Run by:** Zolva (@zolva_agent)

## DM reply draft (owner sends)
> Thanks, appreciate that! Yes, happy to be listed. Just submitted Zolva through /submit (paper trading category fits best). On x402: ours runs on Robinhood Chain in USDG and yours on Base in USDC, so let's see the details first. Linking our backtests from your side sounds good.

Even shorter:
> Thanks! Yes to the listing, I'll send it through /submit. Open to the x402 idea too; ours is USDG on Robinhood Chain, yours USDC on Base, so happy to look at details.

## Their email, 2026-11-16 (Ahsen Rajab, after the submission)
They checked the MIT licence, server.json, the paper-only keyed actions and the rate limits. Before listing they need:
1. **Who runs it** (criterion 3): a company or person named on an official page, with terms. The repo only says "Copyright Zolva".
2. **A published price** ("free" on the site counts).
3. **The ZOLVA token** (criterion 7: no tools whose main job is promoting a token): what it does for someone who never buys it.
Plus: the code has 6 keyless MCP tools, not 5, and http://zolvaagent.app did not load for their checker.

### What we found (2026-11-16)
- **Who runs it:** no person or company is named on zolvaagent.app. /terms (updated 2026-11-11) has no operator name. **Owner decision:** which name (a person, a pseudonym with a real X account, or an entity) goes on an official page.
- **Price:** the home page already says "Your first agent is free" and "Paper trading stays free". Paid, optional: AI credits (free welcome credits, then top-ups) and the premium API (0.02 / 0.03 USDG per call, /docs/premium-api).
- **Token:** optional. Holding raises limits only (lib/tiers.ts: Holder $25+ = 10 agents, 1 agent with free Lite AI reviews, 20 writer tries; Pro $150+ = 20 / 3 / 50; Free = 5 / 0 / 10). Nothing staked or locked; Zolva only reads balances. ZOLVA can be burnt to pay for AI credits (bonus). The Swap page's 0.25% fee on some pairs buys back and burns ZOLVA; stock token swaps carry no Zolva fee. Docs: /docs/token.
- **Tool count:** they are right. Live tools/list (no key) = list_agents, get_agent, list_markets, get_market, recent_activity, **verify_agent** (shipped 2026-11-15). So 6 keyless, 17 with a key.
- **http:** http://zolvaagent.app answers 200 from here (not redirected to https); the first render took 6.4 s, then about 3 s. A slow first render or the missing https redirect is the likely cause of their failed check.
- **Our own error:** the submission said real money is "invite-only". It is not: /terms and /api/live/setup let any eligible user run one real-money agent from their own wallet (scoped signer policy, $100 capital and $300/day caps, removable at any time). It still cannot be started through the MCP or API. Corrected in the email below.

### Pseudonym check (2026-11-16)
- Owner chose a pseudonym. Criterion 3 says only "A company or a person, with terms of service or a licence"; no written rule on pseudonyms.
- 10 listed indie/onchain tools (Nyria, Nova, Arcus, Gloam, Mangrove, Tria, HeyAnon, Olas Pearl, Virtuals ACP, tread.fi): none shows a person's name on its TAS page; operator is the brand/company behind the official site.
- Only operator rejection: 2026-11-13 changelog, TickerLayer and Tritonix "not listed (no named operator)". So the bar is "someone named", not "legal name", but a handle is untested.
- Peers: Satovinci himself is a pseudonym on X (real name only in his llms.txt); x402fi's Hector uses his real name.
- Plan: name the pseudonym + X handle on /terms, and ask Ahsen in the email whether that counts (point 1 of the draft).
- Owner first picked Pitwise (@pitwise), then **changed mind 2026-11-16: keep "Zolva" as the named operator, no personal name or pseudonym.** The email asks Ahsen whether a brand-named operator with terms, licence and contact meets criterion 3 (other listed tools show only a brand).

### Fixes for Development (report to HQ; not Outreach files)
- README, /docs/mcp, server.json description, lib/public-api/mcp.ts comment, lib/devlog.ts: "five read-only tools" -> 6 (17 with a key).
- Redirect http -> https on zolvaagent.app (Cloudflare "Always Use HTTPS" or a Worker rule).
- After the owner decides: name the operator on /terms (and the README / about), e.g. "Zolva is run by ...".
- Optional: a short "Pricing" line in /docs/faq (free paper trading, AI credits, premium API).

### Email reply draft (owner sends; fill the [brackets])
> Subject: Re: Zolva
>
> Hi Ahsen,
>
> Thanks for going through it so carefully. In order:
>
> 1. Who runs it: we run it under the Zolva name rather than a personal one, and would like to keep it that way. We're adding Zolva as the named operator on our terms (zolvaagent.app/terms) and will send you the link once it's live. The code is MIT under the same name, with the official X account @zolva_agent, ERC-8004 agent #25650 and contact at zolvaagent@gmail.com. Would that work for criterion 3? Many tools in your directory show only the brand too. If you need something more, short of a personal name, tell me what would count.
>
> 2. Price: paper trading is free, and the home page says so ("Your first agent is free", "Paper trading stays free"). Optional paid parts: AI co-pilot credits (every account gets free welcome credits, then top-ups) and the premium API, 0.02 / 0.03 USDG per call over x402 (zolvaagent.app/docs/premium-api).
>
> 3. ZOLVA: the agents work fully without it. Someone who never buys it gets the Studio, backtests, 5 running paper agents, the API and the MCP, and pays for AI reviews with credits. Holding it only raises limits (more agents at once, a few free AI reviews on the cheapest models, more strategy-writer tries). Nothing is staked or locked; we only read the balance. It can also be burnt to pay for AI credits, and the 0.25% fee on some Swap page pairs buys back and burns it (stock token swaps carry no Zolva fee). The launch and buyback scripts in the repo are for that. Details: zolvaagent.app/docs/token. Happy for you to mention it on the page.
>
> 4. Tool count: you're right. verify_agent shipped yesterday, so it's 6 keyless tools (17 with a key). We'll update the README and docs.
>
> 5. A correction to my submission: I wrote that real-money mode is invite-only, which is out of date. Any eligible user can run one real-money agent from their own wallet. Zolva is added as a signer under a policy that only allows Uniswap swaps between USDG and listed markets, paid back into the same wallet, capped at $100 of capital and $300 of trading a day, and the user can remove the signer at any time. It can't be started or changed through the MCP or API; the only MCP action that touches it is pause_live_agent. Terms: zolvaagent.app/terms
>
> 6. The site: http://zolvaagent.app answers here, but the first load can take a few seconds and http doesn't redirect to https yet. Could you retry https://zolvaagent.app? We're looking at both.
>
> Thanks,
> Zolva

## Status
- [ ] Owner sends the DM reply
- [x] Listing SUBMITTED 2026-11-15 via tradingagentstack.com/submit/ (owner's go; browser pane): name Zolva, URL https://zolvaagent.app, notes = text above plus "Run by Zolva (@zolva_agent). Suggested category: Risk/safety & paper trading. Referred by @Satovinci via X DM.", source X (Twitter), no email, sponsor-contact box unticked. POST /api/submit 200, "Thanks, we will review it." No email left, so no reply comes by mail: check the site or mention it in the DM
- [ ] After listing: check category, "who places the order" and safety score; ask for a correction if it reads as able to move money
- [x] 2026-11-16: Ahsen emailed 3 blockers (operator name, price, token) + tool count + http. Reply SENT by the owner 2026-11-16 (operator stays "Zolva"). Dev fixes sent to HQ the same day
- [ ] When /terms names Zolva as operator: send Ahsen the link (promised in the email)
- [ ] x402 cross-linking: only after details, and the owner's yes; any code goes to Development
