# Dev log draft (for review)

Draft entries for a public `/devlog` page, newest first, from the public commit history (Oct 15 to Nov 11) and the task log. Each entry: area · title, 2 to 4 sentences, and sources (commits on github.com/zolvaagent/zolva, docs pages, public pages).

Areas (filter chips): **Agents**, **Studio**, **Markets**, **Perps**, **Real money**, **Swap**, **API & MCP**, **Token**, **Research**, **Site**.

Left out on purpose: old brand names, legal notes, marketing and video work, wallet keys and signer ids, other projects, anything a reader cannot check.

Marked ⚠ = please confirm before it goes public.

---

## 2026-11-11

### Agents · Share any agent, with a card made from its own numbers
Every public agent now has a share card: return, P&L in dollars, and a chart of the agent against simply holding the same markets. Paste an agent link on X, Telegram or Discord and the card shows up by itself. The Share menu adds Post on X (text filled in), Copy link and Download image. Private agents only ever get the plain Zolva card.
Sources: [57ef0ca](https://github.com/zolvaagent/zolva/commit/57ef0ca), [06c447f](https://github.com/zolvaagent/zolva/commit/06c447f)

### Agents · P&L in dollars on the agent page
Holdings now show each position's P&L in dollars with the percent below, plus an unrealized P&L total next to cash. The decision log always starts with the newest hour, tagged Latest, which replaced the separate Latest decision card.
Sources: [102d594](https://github.com/zolvaagent/zolva/commit/102d594), [f4c1732](https://github.com/zolvaagent/zolva/commit/f4c1732)

### Studio · Perps, Dip hunter and Spike fade in the Studio
The Studio can now build perps agents (paper only), backtested with the 0.05% cost per fill and each hour's real funding, the same way the Lab perps agents run. Dip hunter (spot or perps) and Spike fade (perps only, it shorts) join the strategy list. Copy to Studio works for perps agents too.
Sources: [eb6bae3](https://github.com/zolvaagent/zolva/commit/eb6bae3), [ac9734d](https://github.com/zolvaagent/zolva/commit/ac9734d)

### Studio · Start from a preset
A first visit to the Studio opens on the best of three fixed starting points, each shown with its real last 30 days, and names the agent for you. Accounts without an agent get a "Launch your first agent" card on the dashboard.
Sources: [1e6eb68](https://github.com/zolvaagent/zolva/commit/1e6eb68)

### Swap · Swap $ZOLVA and any Pons token
The swap card now routes $ZOLVA through its own Pons pool (Uniswap v4, the pool key is pinned in code and checked against the pool id). Paste any contract address: Pons tokens and tokens with a USDG pool can be imported after a warning. Native ETH sits next to WETH, and imported tokens get dollar estimates and their real logos.
Sources: [66d4383](https://github.com/zolvaagent/zolva/commit/66d4383), [eb7ce4f](https://github.com/zolvaagent/zolva/commit/eb7ce4f), [f90c790](https://github.com/zolvaagent/zolva/commit/f90c790), [8c13038](https://github.com/zolvaagent/zolva/commit/8c13038), [a4a9ca5](https://github.com/zolvaagent/zolva/commit/a4a9ca5)

### Token · 0.25% swap fee: burn on ZOLVA buys, buybacks on the rest
Swaps between USDG, ETH, BTC, ZOLVA and Pons tokens pay 0.25%. On ZOLVA buys the fee is paid in ZOLVA and burnt in the same transaction; on the other pairs it goes to a fee wallet that buys back and burns ZOLVA. Stock tokens never pay the fee. Every address involved is on /docs/contracts.
Sources: [0af63ff](https://github.com/zolvaagent/zolva/commit/0af63ff), [0db0c5e](https://github.com/zolvaagent/zolva/commit/0db0c5e), [/docs/token](https://zolvaagent.app/docs/token), [/docs/contracts](https://zolvaagent.app/docs/contracts)

### Token · ZOLVA links point to the main pool
The token card links to GeckoTerminal and DexScreener for ZOLVA's Uniswap v4 pool.
Sources: [6fcdae4](https://github.com/zolvaagent/zolva/commit/6fcdae4)

### API & MCP · Listed in more MCP directories
Zolva's MCP server is listed on Glama, with a pull request open to awesome-remote-mcp-servers and a submission to the Cline marketplace. The repo now carries a plugin manifest and an llms-install.md so AI clients can set it up themselves.
Sources: [d55da60](https://github.com/zolvaagent/zolva/commit/d55da60), [39c9df5](https://github.com/zolvaagent/zolva/commit/39c9df5), [89daf60](https://github.com/zolvaagent/zolva/commit/89daf60)

---

## 2026-11-10

### Token · ZOLVA launched, dev share burnt
ZOLVA launched on Pons: 1,000,000,000 supply, contract 0x8e04…681f. The dev share, 41,506,204.54 ZOLVA (4.15%), was sent to the dead address minutes later, leaving the dev wallet at zero. The token card on /docs/token, /docs/verify and the new /docs/contracts shows the official address with links to check it.
⚠ Add the full burn transaction hash (the task log only keeps 0xda25f6ff…544c).
Sources: [b0b69e7](https://github.com/zolvaagent/zolva/commit/b0b69e7), [bba2aa7](https://github.com/zolvaagent/zolva/commit/bba2aa7), [/docs/token](https://zolvaagent.app/docs/token)

### Real money · Real money from your own wallet
Real money agents can now be set up from the Studio: you add Zolva as a signer under a policy made for your wallet, which only allows swaps between USDG and listed markets, paid back into the same wallet. Caps stay on: $100 per agent, $300 of trading a day, one real money agent at a time.
⚠ Confirm this is open to users now (the task log still says "built, owner test first").
Sources: [45840c1](https://github.com/zolvaagent/zolva/commit/45840c1), [/docs/guardrails](https://zolvaagent.app/docs/guardrails)

### Perps · Shorts move to perps; spot stays long only
Spot agents are long only, enforced in the database; shorting now happens on perps. Lab · Perps Spike Fade replaced the spot Spike Fade (its record is kept), and Lab · Perps Deep Dip Alts runs the deep dip rule on HYPE, ZEC, XRP, LIT and NEAR perps.
Sources: [43cb87c](https://github.com/zolvaagent/zolva/commit/43cb87c), [eb35628](https://github.com/zolvaagent/zolva/commit/eb35628)

### Markets · Perps on Markets, the API and MCP
The 8 Lighter perps are listed under Crypto with a funding column (the last hour as a yearly rate), and each has its own page. The public API and MCP now return perps with their venue and funding, and agents say whether they trade spot or perps and whether they short. The leaderboard and Agents pages filter All, Spot and Perps.
Sources: [90a7766](https://github.com/zolvaagent/zolva/commit/90a7766), [83c947b](https://github.com/zolvaagent/zolva/commit/83c947b), [b710950](https://github.com/zolvaagent/zolva/commit/b710950)

### API & MCP · On the official MCP Registry
Zolva is published on the official MCP Registry as app.zolvaagent/zolva, proven by a file on our own domain.
Sources: [c8c3291](https://github.com/zolvaagent/zolva/commit/c8c3291)

### Real money · Fix: approvals sized from a gas estimate
Live approvals used a fixed gas limit, which the chain rejected once as too low. They now use the estimate plus 30%, with a 100k floor, like the swaps.
Sources: [eb35628](https://github.com/zolvaagent/zolva/commit/eb35628)

---

## 2026-11-08

### Perps · First perps agent: Lab · Perps Deep Dip
A paper agent now trades BTC, ETH and SOL perps on Lighter, with 0.05% cost per fill and real hourly funding taken from the position. Its rule buys a deep dip (more than 2.5 standard deviations under the 96 hour average) and sells on the way back, with a 5% stop.
Sources: [a4d4371](https://github.com/zolvaagent/zolva/commit/a4d4371), [ecf15aa](https://github.com/zolvaagent/zolva/commit/ecf15aa), [agent page](https://zolvaagent.app/agents/407eb4b0-07ea-41c9-9571-cdde749cd3e9)

---

## 2026-11-07

### Research · Perps: one rule out of 5,580 survived
We searched 5,580 rule combinations on Lighter's perps history and locked three in before testing them on a month they had never seen. Only the deep dip on BTC, ETH and SOL passed: +1.7% while holding fell 14.1%. Scalping and plain mean reversion lost after costs. That rule became the first perps agent.
Sources: [faf83bb](https://github.com/zolvaagent/zolva/commit/faf83bb)

### Site · Public stats page
/stats shows the engine's totals from one database call: decisions made, agent hours, simulated volume, real trades with Blockscout links, decisions per day and the most traded markets. Paper volume is labelled simulated.
Sources: [8b497a5](https://github.com/zolvaagent/zolva/commit/8b497a5), [/stats](https://zolvaagent.app/stats)

### Agents · Fix: Spike fade pays its borrow fee from the short's cash
A short's borrow fee could push the agent's cash below zero and stop it. The fee now comes out of the cash the short locked, so cash never goes negative.
Sources: [9475080](https://github.com/zolvaagent/zolva/commit/9475080)

---

## 2026-11-06

### API & MCP · Premium API paid per call in USDG (x402)
Two paid endpoints: a market scan for 0.02 USDG and a backtest for 0.03 USDG, paid per request over x402 with no account. We run our own facilitator on Robinhood Chain; the first payment settled in 0.9 seconds.
Sources: [a0de1bc](https://github.com/zolvaagent/zolva/commit/a0de1bc), [43d9f64](https://github.com/zolvaagent/zolva/commit/43d9f64), [d96bad0](https://github.com/zolvaagent/zolva/commit/d96bad0), [/docs/premium-api](https://zolvaagent.app/docs/premium-api)

### Agents · Agents directory with "Use these rules"
/agents shows every public agent: what it holds, its latest decision with the reason, and its last trade. Use these rules opens the Studio with the same strategy, markets and limits.
Sources: [bde3a89](https://github.com/zolvaagent/zolva/commit/bde3a89)

### Site · Verify page and honest roadmap labels
/docs/verify lists every claim with its status and how to check it: the code, the API, the prices and the real money wallet. The landing roadmap now says Live, In testing or Planned, and the live agent's page is public with a transaction link for every trade.
Sources: [9d9c9bd](https://github.com/zolvaagent/zolva/commit/9d9c9bd), [/docs/verify](https://zolvaagent.app/docs/verify)

### Swap · Swap in the app, Sell on live agents
A swap page with a DEX style card: any pair through USDG, wallet balances, a chart of the bought token and the wallet's latest transactions. Owners of live agents get a Sell button on each position, signed by their own wallet.
Sources: [9e8a8fe](https://github.com/zolvaagent/zolva/commit/9e8a8fe), [8e37e40](https://github.com/zolvaagent/zolva/commit/8e37e40), [7988b16](https://github.com/zolvaagent/zolva/commit/7988b16), [09e2183](https://github.com/zolvaagent/zolva/commit/09e2183)

### Site · README, MIT license and security policy
The repo has a README (how the hourly engine works, the API and MCP, local setup), an MIT license, SECURITY.md and Dependabot. It scored 100/100 on the HOL plugin scanner and was added to their plugin catalog.
Sources: [5e99832](https://github.com/zolvaagent/zolva/commit/5e99832), [e64ed6d](https://github.com/zolvaagent/zolva/commit/e64ed6d), [1144a83](https://github.com/zolvaagent/zolva/commit/1144a83)

### Research · Scalping and long plus short: no edge
Scalping ETH and BTC on minute prices had no edge after costs. Holding a dip long and a short side by side did not beat the simpler rules either.
Sources: [0db3f1d](https://github.com/zolvaagent/zolva/commit/0db3f1d), [e177edb](https://github.com/zolvaagent/zolva/commit/e177edb)

---

## 2026-11-04

### API & MCP · Public API v1
Agents, markets and recent trades as JSON, with no key: /agents, /agents/{id}, /markets, /markets/{symbol} and /activity. Published paper agents only, decision reasons for the last 24 hours, about 60 requests a minute per IP, cached at the edge.
Sources: [29673ab](https://github.com/zolvaagent/zolva/commit/29673ab), [0b05e18](https://github.com/zolvaagent/zolva/commit/0b05e18), [/docs/public-api](https://zolvaagent.app/docs/public-api)

### API & MCP · MCP server
The same data as five read-only tools at zolvaagent.app/mcp, so Claude, Cursor and other AI clients can answer from live agent data. No key needed.
Sources: [ff14d24](https://github.com/zolvaagent/zolva/commit/ff14d24), [/docs/mcp](https://zolvaagent.app/docs/mcp)

### Token · Holder tiers and paying for AI with ZOLVA
Built ahead of the token: holding ZOLVA unlocks higher limits and free AI reviews, with nothing to stake. AI credits can be paid by burning ZOLVA from your wallet, credited at +10%.
Sources: [bf421ba](https://github.com/zolvaagent/zolva/commit/bf421ba), [b4304eb](https://github.com/zolvaagent/zolva/commit/b4304eb), [/docs/token](https://zolvaagent.app/docs/token)

### Site · New logo, and look around before logging in
The Z badge on a violet gradient replaces the old mark. Go to app now lets visitors browse the app before logging in.
Sources: [6d4d4cc](https://github.com/zolvaagent/zolva/commit/6d4d4cc), [ec74d07](https://github.com/zolvaagent/zolva/commit/ec74d07)

---

## 2026-11-03

### Agents · Spike fade: the first strategy that shorts
When a price spikes far above its recent average, Spike fade shorts it and covers when it falls back. Paper only.
Sources: [d5c66d9](https://github.com/zolvaagent/zolva/commit/d5c66d9)

### Agents · Dip hunter: many markets, one position
Dip hunter watches up to 20 markets and buys only the deepest dip, one position at a time. Lab · Dip Hunter runs it on 14 markets.
Sources: [703c05f](https://github.com/zolvaagent/zolva/commit/703c05f), [32af195](https://github.com/zolvaagent/zolva/commit/32af195)

### Research · What holds up in a falling market
Rotation lost in every window we tested. Buying the deepest dip across all live markets stayed ahead of holding in the falling month. Short signals on stocks lost money; a spike fade on crypto was the one short that worked on BTC's history.
Sources: [36ffd37](https://github.com/zolvaagent/zolva/commit/36ffd37), [5108a9e](https://github.com/zolvaagent/zolva/commit/5108a9e), [5270242](https://github.com/zolvaagent/zolva/commit/5270242)

---

## 2026-10-31

### Real money · First live fill
The first real money agent filled its first trade on chain (GME), from our own wallet. Every live trade links to its transaction.
⚠ Confirm we want this one public (it is already on /docs/verify).
Sources: [dccb267](https://github.com/zolvaagent/zolva/commit/dccb267), [a77ec87](https://github.com/zolvaagent/zolva/commit/a77ec87), [/docs/verify](https://zolvaagent.app/docs/verify)

---

## 2026-10-30

### Real money · Fix: live value from what the agent holds
A live agent's value briefly showed the cost of trades that never filled. It is now recorded from the cash and positions it really holds. Order errors keep the chain's reason, and never the node URL.
Sources: [63c276c](https://github.com/zolvaagent/zolva/commit/63c276c), [898b5b7](https://github.com/zolvaagent/zolva/commit/898b5b7)

---

## 2026-10-29

### Site · The code is public
github.com/zolvaagent/zolva is public: the engine, the hourly runner and every strategy.
Sources: [f81ae44](https://github.com/zolvaagent/zolva/commit/f81ae44)

### Agents · Export your wallet key
Email and Google accounts can export their wallet's private key through Privy's own window; Zolva never sees it. Wallets with a live signer can remove Zolva's signer, which pauses their live agents.
Sources: [e61163b](https://github.com/zolvaagent/zolva/commit/e61163b)

---

## 2026-10-28

### Real money · First real swap, then a live executor
A $2 USDG to NVDA swap on mainnet filled at the quote, signed under a wallet policy that refused a plain USDG transfer. The live executor followed the same day with a kill switch, a $100 cap per agent, $300 a day, 1% slippage and a 2% price check; an agent pauses itself after two failed orders. The first live agent runs on our own wallet.
Sources: [a235806](https://github.com/zolvaagent/zolva/commit/a235806), [6180f1f](https://github.com/zolvaagent/zolva/commit/6180f1f), [b90c61b](https://github.com/zolvaagent/zolva/commit/b90c61b), [0ae1de2](https://github.com/zolvaagent/zolva/commit/0ae1de2)

---

## 2026-10-27

### Site · Docs
Ten docs pages, from Getting started to the glossary, with every number taken from the engine and the app. Writing them turned up four places where the app and the copy disagreed; those were fixed.
Sources: [44340f6](https://github.com/zolvaagent/zolva/commit/44340f6), [8012263](https://github.com/zolvaagent/zolva/commit/8012263), [d8c5e5f](https://github.com/zolvaagent/zolva/commit/d8c5e5f), [/docs](https://zolvaagent.app/docs)

### Site · Dark mode
A Light and Dark switch, saved per browser; a first visit follows your system.
Sources: [dec18aa](https://github.com/zolvaagent/zolva/commit/dec18aa), [1aa37bb](https://github.com/zolvaagent/zolva/commit/1aa37bb)

---

## 2026-10-24

### Markets · ETH and BTC
ETH and BTC are priced each hour from their USDG pools on Robinhood Chain, and a close is rejected if it is more than 2% from Chainlink at the same block. Five Lab agents run the classic strategies on both.
Sources: [93c4a32](https://github.com/zolvaagent/zolva/commit/93c4a32), [4d8b560](https://github.com/zolvaagent/zolva/commit/4d8b560)

---

## 2026-10-19

### Site · zolvaagent.app
Zolva moved to its own domain.
Sources: [819b444](https://github.com/zolvaagent/zolva/commit/819b444)

---

## 2026-10-16

### Agents · AI co-pilot
Any agent can get an AI co-pilot. When the rules want to trade, the AI approves or passes, with a reason you can read; stop loss, take profit and max hold always run. Every account starts with $0.50 of free credits, and each agent has its own AI spending limit and end date.
Sources: [a4530ce](https://github.com/zolvaagent/zolva/commit/a4530ce), [60be73a](https://github.com/zolvaagent/zolva/commit/60be73a), [/docs/ai-copilot](https://zolvaagent.app/docs/ai-copilot)

### Studio · Prompt mode
Describe a strategy in plain words and the AI writes it as normal rules you can edit and backtest before launch. The Forge became the Studio.
Sources: [ce6d5d1](https://github.com/zolvaagent/zolva/commit/ce6d5d1), [d19f41a](https://github.com/zolvaagent/zolva/commit/d19f41a)

### Agents · Private by default, publish when you want
New agents are private. Publishing puts an agent on the leaderboard and in the feeds; a private agent's page is a 404 for everyone but its owner.
Sources: [92e0d6b](https://github.com/zolvaagent/zolva/commit/92e0d6b)

---

## 2026-10-15

### Agents · Zolva goes live
Paper trading agents for 20 stock tokens on Robinhood Chain. Build one in the Studio from a preset or your own rules, backtest it on the last 30 days with the same engine, then launch it; every agent decides once an hour and writes down why. Up to 5 running agents per account, a leaderboard, and house agents labelled by Zolva.
Sources: [179baf9](https://github.com/zolvaagent/zolva/commit/179baf9), [/docs/getting-started](https://zolvaagent.app/docs/getting-started)

### Markets · Prices read straight from the chain
Each hourly close is the token's USDG pool price at the last block before the hour ends, read for all tokens in one call. Missed hours heal themselves on the next run. All 20 tokens match Robinhood's official Stock Token list.
Sources: [179baf9](https://github.com/zolvaagent/zolva/commit/179baf9), [a979b78](https://github.com/zolvaagent/zolva/commit/a979b78), [/docs/markets-and-prices](https://zolvaagent.app/docs/markets-and-prices)

### Markets · Markets and Activity pages
/markets lists every token with its price moves and a 7 day sparkline. /activity shows the last 48 hours hour by hour, every trade with the agent's own reason.
Sources: [a979b78](https://github.com/zolvaagent/zolva/commit/a979b78)

### Agents · The Lab, and an honest start
Fifteen agents run by Zolva test the strategies side by side. At launch, every one of them had lost to simply holding in the last three 30 day backtests; we shipped anyway and kept the record public.
Sources: [179baf9](https://github.com/zolvaagent/zolva/commit/179baf9)
