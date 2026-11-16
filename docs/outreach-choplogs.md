# Chop (@ChopLogsApp): integration check (2026-11-14)

Owner's question: "apakah bisa colab atau saling integrasi dengan ChopLogsApp?"

## What Chop is (read 2026-11-14 from choplogs.app docs, X and the chain)

**Product**
- "Volatility farming" on Robinhood Chain (4663). It is a fork of Peapods: the footer says "utilizing proven peapod infrastructure".
- How it works:
  - You wrap a token into a "log" (TOKEN becomes chTOKEN).
  - The log token trades in its own pool, which lags the underlying token.
  - Arbitrage bots close the gap and pay wrap, unwrap and trade fees (0.2 to 1%).
- Where the fees go:
  - 15% burns log tokens, so each log token is backed by more of the underlying.
  - The rest is converted to $CHOP: 80% goes to farmers and 20% is burned.
  - A project can set a partner fee of up to 5%.
- Anyone can launch a log for any token, with no listing fee. Chop tags reviewed logs as Verified.

**Token and NFT**
- $CHOP: `0x100765a16f42636bd84ee1e86bc5107b84bcdba3`, launched on Bankr.
- Allocation: 70% to the liquidity pool, 15% to the team (1-month cliff, then 12 months of vesting), 15% to product and marketing.
- Lumberjacks NFT: 1,000 minted at 0.02 ETH, with wrap-for-yield.

**Contracts and data**
- Log registry: `0xF2A26110396b4162d48A16eE8683372a6A2c3b76` (the full list is under /docs/contracts).
- No public REST API. The app reads the chain through its own `/api/rpc` proxy.
- The GitHub repo in their JS bundle (`Chopmaster9000/chop-contracts`) returns 404, so it is private or gone.
- Agents can already use Chop through **Oak MCP** (Nov 6): find logs, wrap, farm, harvest.

**Traction**
- 1,590 followers. The account was created 2026-09-23 and the token launched 2026-10-07.
- Pinned launch tweet: 55k views. Normal tweets get 0.5k to 2k views, and the bigger ones 4k to 15k.
- Claimed TVL: $150K on Oct 29, $300K on Nov 12. Not checked independently.

**Integrations so far**
- Hookr (chHOOKR) and Goldstein Group (chgHOOD, an index token).
- Ramses DEX (next on their roadmap).
- Oak MCP.
- Paid promotion on MCG Signal.
- Hinted: "a very large integration" and "bigger partners coming in".

**On-chain read of the registry (2026-11-14)**
- 23 logs. All of them wrap ecosystem or meme tokens: CHOP, QUOTIENT, AGENTOS, VRAX, SURPLUS, BNKR, RAETO, VEYA, WSNET, GLDSTN, WEALLMFERS, PAPA, WORM, PRIORS, CTRL, HEY, PACKD, OAK, HOOKR, GHOOD, CASHCAT.
- **None wraps a stock token, ETH or BTC.** There is no overlap with Zolva's market allowlist.
- They replied to @RobinhoodCrypto on Nov 2: "Stable logs coming for stocks." There is no date.

## Red flags (normal for this chain, but note them)
- Marketing is APR-led: "300%-800% APR" and "the highest APR onchain". That clashes with Zolva's no-returns copy rule.
- Upgradeable contracts: one upgrade-key holder can replace the code behind every log. Moving that power to a multisig is "may later".
- The token docs say plainly: supply, mint permissions and what happened to the launch liquidity are "pending disclosure".
- Audit: one High and eight Medium findings, all reported as resolved, with sign-off by the Bankr team. The auditor is not named in the text we read.
- The hype is pushed by token and NFT activity: buybacks, mint deadlines, "floor is rising".
- They tell @RobinhoodCrypto in public that "your partnerships team already loves us". That is a self-claim.
- No rug or exploit reports turned up in an X search.

## Fit with Zolva

| Route | Verdict | Why |
|---|---|---|
| Data, Chop into Zolva (a `chop` field on markets, like Longbow) | **Not now** | Chop has no log on any Zolva market, so there is nothing honest to show. This becomes real once their stock logs ship: then it is a read-only "this stock has a Chop log" field plus a link, read from the registry on chain at no cost and with no permission needed |
| Data, Zolva into Chop | Weak | Chop's flow comes from arbitrage bots. Our paper agents trade hourly and never touch their pools. Our hourly closes and volatility per stock could help them pick stock logs, but nobody has asked for that |
| Cross-listing | No | Chop is not a directory. Oak MCP already covers "agents use Chop" |
| Co-post | No, for now | Their copy is APR and token-led, and ours bans returns talk. A shared post would pull Zolva into yield marketing |

**Overall: not worth a build or a co-post today.**
- The product is real and active, and it has already worked with HEY and Oak, the same circle we work with.
- But there is no overlapping market, and the brand tone clashes.

## Cheapest real step
1. **Now:** one short DM asking when the stock logs ship. It also tells them we would show their logs on Zolva's stock pages when they do. It costs nothing and commits us to nothing.
2. **When stock logs launch:** Development adds a read-only `chop` field (registry read, matched by underlying address, never by symbol, Verified logs only), the same way as the Longbow field. Then the owner tags or DMs them with the live field.

## DM (sent by the owner 2026-11-14, waiting for a reply)

> Hey Chop team, Zolva here (no-code paper trading agents for tokenized stocks on Robinhood Chain, public API + MCP).
>
> Saw "stable logs coming for stocks". When those go live, we'd like to show "has a Chop log" with a link on our stock pages and in our API/MCP, read straight from your registry. No ask on your side.
>
> Any rough timing, or which stocks first? Happy to ping you when it's wired.

Notes:
- Short version for a reply instead of a DM: "When the stock logs ship, we'll show them on Zolva's stock pages and in our API/MCP."
- Do not mention APR or yield, and do not use "partnership".

## Sources
- https://choplogs.app/docs (introduction, for-projects, logs, fees, chop-token, risks, admin-powers, audit, contracts)
- https://x.com/ChopLogsApp: pinned launch tweet 2107879280877428816; roadmap and Ramses 2120939877386908098; "Stable logs coming for stocks" 2117365371078414841; $300K TVL 2121184412607922525
- Oak MCP: https://x.com/OakAgentKit/status/2118480673690485188
- Registry `allIndexes()` read through `ROBINHOOD_RPC_URL`, 2026-11-14

## Reply log
- 2026-11-14 21:44: Chop replied "It looks like eo this month!", so their stock logs are expected by the end of November 2026.
- Next: around 2026-11-30, read the registry (`allIndexes()`) again and match each log's underlying token address against `data/stock-tokens.json`. If any match, hand the read-only `chop` field to Development.
- 2026-11-15 11:43: the owner sent "Nice, thanks! We'll keep an eye on the registry and ping you once it's showing on Zolva."

## Chop ranking for Zolva markets (2026-11-15, data for Chop's "which stocks first")

**Source**
- Zolva's public API, `GET /api/public/v1/markets/{symbol}` (closes).
- 721 hourly closes per market (the last 30 days), read from each token's token/USDG pool on chain.
- Read-only. Script: `chop-rank.mjs` in the session scratchpad. It can be re-run any time.

**Metrics**
- **Swing**: the sum of every hourly move (absolute log moves), in %. More swing means more chances for arbitrage.
- **Net**: how far the price actually went from start to end of the 30 days, as an absolute %.
- **Efficiency** = net ÷ swing. Lower means choppier: lots of movement that goes nowhere.
- **Moving hours**: the share of hours in which the price changed at all. A low share means a thin pool or stale hours.

| # | Market | Swing 30d | Net 30d | Efficiency | Moving hours |
|---|---|---|---|---|---|
| 1 | MSTR | 416% | 38.5% | 0.092 | 95% |
| 2 | MU | 387% | 19.8% | 0.051 | 94% |
| 3 | AMC | 353% | 6.7% | 0.019 | 95% |
| 4 | CRCL | 360% | 39.2% | 0.109 | 90% |
| 5 | SPCX | 319% | 11.0% | 0.035 | 100% |
| 6 | GOOGL | 290% | 18.1% | 0.062 | 100% |
| 7 | NVDA | 298% | 30.5% | 0.102 | 100% |
| 8 | TSLA | 251% | 2.9% | 0.012 | 86% |
| 9 | BABA | 252% | 7.4% | 0.029 | 69% |
| 10 | USO | 239% | 7.5% | 0.032 | 86% |
| 11 | ETH | 259% | 29.3% | 0.113 | 100% |
| 12 | PLTR | 230% | 19.4% | 0.084 | 68% |
| 13 | RDDT | 239% | 49.4% | 0.206 | 56% |
| 14 | GME | 188% | 10.3% | 0.055 | 99% |
| 15 | BTC | 201% | 23.6% | 0.117 | 99% |
| 16 | TSM | 179% | 7.3% | 0.041 | 46% |
| 17 | META | 186% | 15.3% | 0.083 | 75% |
| 18 | AMZN | 164% | 3.0% | 0.018 | 78% |
| 19 | QQQ | 138% | 8.1% | 0.059 | 98% |
| 20 | AAPL | 121% | 4.2% | 0.035 | 99% |
| 21 | GLD | 119% | 8.5% | 0.071 | 99% |
| 22 | SPY | 37% | 3.0% | 0.081 | 58% |

**Reading it**
- The cleanest "chop" names, with high swing and almost no net move, are **AMC, TSLA, SPCX, MU, BABA and USO**.
- AMZN and AAPL also chop, with smaller swings.
- MSTR, CRCL, NVDA and RDDT swing a lot but also trended, so they are less "pure chop".
- Caveat: these are pool prices on chain. Part of the swing is pool noise between trades, not only the stock's own moves. That is also what Chop's arbitrage bots see. TSM, RDDT, SPY, PLTR and BABA have thin hours (moving hours under 70%).
- No yield, APR or returns are shown or implied. It is a description of past price movement only.

## Follow-up DM (owner sends; not sent; send 1-2 days after 2026-11-15, not the same day)

> One more thing that might help you pick the first stocks: we ran our last 30 days of hourly closes (on-chain pool prices) for every stock token we track. The most "choppy" names, with big swings and little net move, were AMC, TSLA, SPCX, MU, BABA and USO. Full table attached.
>
> All from our public API (zolvaagent.app/docs/public-api), so you can pull it yourselves anytime.

Notes:
- Attach docs/outreach-assets/choplogs-chop-ranking.png (2400 px wide; rebuild with `node docs/outreach-assets/build-choplogs-ranking.mjs`).
- No APR or yield talk, and no "partnership".
