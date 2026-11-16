# Integration outreach candidates (2026-11-13)

What we are looking for is the same pattern as Longbow, HEY Research and Harmonic:
1. Read their public data or API into Zolva at no cost.
2. Show it as one small, honest field or feature.
3. Then DM or tag them, as a listing or free API use. Never call it a partnership.

The facts below come from web search on 2026-11-13. They are not yet checked against each project's own docs. Verify before building.

| Rank | Project | What it is | Zolva angle (cheapest real step) | Reach | Risk |
|---|---|---|---|---|---|
| 1 | **Arcus** (dYdX team, backed by Robinhood) | DEX on the chain: 95+ stock tokens, perps, pTokens (leveraged ERC-20 like pHOOD3x), USDG collateral, ~$100M/day claimed | Add an `arcus` field on markets in the API/MCP, like Longbow's: "also trades on Arcus" plus a link. Later, Arcus stock perps as a second paper perps venue next to Lighter | High: Robinhood Crypto put it on the official ecosystem page | No public API docs; only api.arcus.xyz/v1/feetiers is known. Stock tokens are blocked for US, CA and UK users |
| 2 | **Virtuals Protocol** (ACP) | The biggest agent layer on the chain: thousands of agents, agent-to-agent jobs (ACP) with escrow | Offer Zolva as an ACP provider: "backtest these rules" or "explain this agent's last 24 h" as a job other agents can buy. Our MCP/API already does the work | Very high | More effort (ACP SDK, wallet). Promo-heavy figures. Our token sits next to theirs, so stay neutral |
| 3 | **Aatos MCP** | Non-custodial MCP for stock tokens on 4663: quotes, execution plans, Morpho Earn | A cross-link doc or post: "research with Zolva (paper), plan with Aatos". Ask for a mutual mention in each other's docs | Low to medium | Only its own listing describes it; quality unknown |
| 4 | **Spark spUSDG / Mellow rUSDG / Maple syrupUSDG** | USDG yield vaults on the chain | A read-only "idle USDG could earn X% (Spark/Mellow/Longbow)" line for live agents, and the same idea as the Longbow vault | Spark and Maple are big | Showing an APY reads like advice; use the "not investment advice" frame. Only the live (real money) side is relevant |
| 5 | **Chainlink** | Our crypto prices are already checked against Chainlink feeds (2% guard) | No build needed. A post or tag: "every BTC/ETH close checked against Chainlink". Possibly a Chainlink BUILD or ecosystem listing | Very high | Low chance of a reply; just a tag |
| 6 | **hood-mcp / rob-mcp / rhc-mcp** (community MCPs) | Read-only stock-token MCPs | Cross-link in READMEs, PRs to their "related" sections | Low | Tiny audiences |

## Arcus vs Lighter (checked 2026-11-13)
Arcus and Lighter compete for perps on this chain. Our Lighter link is free API use with no exclusivity, but P45 said "Every perp, powered by Lighter".
- Step 1 (spot stock tokens, read-only `arcus` field): low friction. It does not touch perps.
- Arcus perps as a second paper venue: wait for that. If we do add it, keep Lighter, frame it neutrally ("compare venues"), and update the copy that says "powered by Lighter".

## Listings, no integration needed (same lane as the MCP directories)
- **Alchemy dApp store**, Robinhood Chain ecosystem page (alchemy.com/dapps/ecosystem/robinhood-chain). 24 apps (checked 2026-11-13), AI category included (EventTrader, Prism402, StonkBrokers). Listings are "reviewed and written by Alchemy" from inbound submissions and research. No public submit form or link was found on the pages, so the route is still unknown (an email or contact form may be needed).
- **Official Robinhood Chain ecosystem page** (docs.robinhood.com/chain). Curated, with no public form. The only official contact found is chain-developers-group@robinhood.com, which is a feedback address and not confirmed as a listing channel.
- Ecosystem maps: cryptorank.io ecosystems, alphagrowth.io, trustswap.com/robinhood/ecosystem, Envio's dev.to "live apps" post, kolhq.
- **DefiLlama**: probably not, since paper agents have no TVL. Skip unless live grows.

## Skipped
- Pyth on the chain: unconfirmed; the stock feeds are Chainlink.
- Vectr and hood.fun (launchpads): no fit with paper-trading agents.
- Monvera (Virtuals AI broker): looks like a competitor.

## Sources
- https://dev.to/envio/robinhood-chain-ecosystem-live-apps-and-how-to-index-them-37j0
- https://fintech.global/2026/07/03/robinhood-launches-robinhood-chain-mainnet-and-defi-suite/
- https://theblock.co/news/defi/2026-08-25-robinhood-chain-dex-arcus-ptokens-perps-erc-20s-412696
- https://defillama.com/protocol/arcus
- https://cryptobriefing.com/virtuals-protocol-200m-robinhood-chain/
- https://forkast.news/virtuals-protocols-three-layer-stack-aims-to-turn-ai-agents-into-an-economy/
- https://www.mcpbundles.com/skills/aatos-mcp-2cfdbaf1d1
- https://nirholas.github.io/robinhood-chain-mcp/
- https://docs.robinhood.com/chain/oracles-and-price-feeds
- https://www.alchemy.com/dapps/ecosystem/robinhood-chain

## Longbow: who they have worked with (checked 2026-11-14 on @longbowlend's X and the web)
- **Unifold** (Sep 28): Longbow calls this "partnering" itself. Card and cross-chain deposits arrive as USDG. Unifold is a Robinhood Chain launch partner backed by Robinhood Ventures.
- **Mancer** (@MancerXYZ, Nov 11): routes swaps inside the Longbow app (borrow, swap, repay).
- **Ondo** (Oct 27-30): 15 Ondo stock tokens listed as collateral, plus 11 Uniswap StablePair pools.
- **Collateral listings for ecosystem tokens:** Spark spUSDG (Sep 15), Delta (@deltaliquidity, Sep 26), PONS (the Pons launchpad token), Ford, IBM, IonQ, Bloom Energy and others.
- **Base layer:** Morpho Blue (Longbow curates the markets and vaults), Chainlink.
- **Programs:** builders program (50% of the performance fee through builderCode, launched about Aug 27) and a $50k "Builder of the Month Fund" (Oct 21): top builders by volume win USDG plus co-marketing and intros.
- **Team:** advisor Shervin Beyk, focused on partnerships (Sep 19). CMO Rick Bakas (Sep 10).
- **Amplification:** Robinhood Crypto quoted Longbow Autopilot (Nov 11), and RobinhoodHub named Longbow builder of the week (Oct 1). In @longbowlend's last 21 tweets, no repost of a third-party agent app was found.
- **What this means for us:**
  - Their partner deals are about distribution: deposits, swaps, listings.
  - Co-marketing through the fund is tied to attributed volume, and we have none yet.
  - Our strongest ask is still the builderCode links plus idle USDG from live agents.

## Round 2: active Robinhood Chain projects (X search, posts from 2026-11-05 to 11-14)
Every project below posted in the last 10 days.

### Distribution first (cheap, high value)
| Project | Why | Step |
|---|---|---|
| **@RobinHubHB** (RobinHub, 24k) | Posted "35 projects building across the agent economy" on 11-05 (6k views). **Zolva is not in it.** Daily recaps; a "Collabs" link in the bio | DM or use the collab form: ask to be added to the next agent list or recap. Facts: MCP 1.1.0 with 16 tools, ERC-8004 #25650, Longbow and Lighter data |
| **@RobinhoodHub** (Robinhood Hub, 24k) | "Builder of the Week" series (Longbow, Delta, Legs) plus a daily brief | Pitch Zolva for Builder of the Week, using the same fact list |
| **@clutchmarkets / StonkBrokers** (SimpleFarmer, 28.5k) | Asked AI agent builders to reach out (11-12, see docs/x/tweets-2.md). Launched tokenized funds on StonkBrokers | DM SimpleFarmer: Zolva as the place to test strategies on their funds or tokens (paper first) |

### Agent projects with a real data or integration angle
| Project | What | Zolva angle |
|---|---|---|
| **Mosh** (@Moshdottrade) | 99 agents managing $25M, $443k in fees to users. Robinhood Crypto amplified it (52k views) | Probably no data fit (bundled trades or LP). Reach only. Low odds |
| **Circuit** (@CircuitAI) | LP agents for Stock Token/USDG pools on Metric. Robinhood Crypto amplified it (35k views) | Same audience (agents on stock tokens). A docs cross-link "LP with Circuit, test directional strategies with Zolva" |
| **Hookr** (@Hookrfun, 7.7k) | MCP server with 24 tools (Uniswap v4 hooks, launches), no key. Very active. Harmonic built on it | MCP-to-MCP: a joint Claude Code demo (Hookr for pools, Zolva for strategies). We already know Harmonic |
| **Quotum** (@quotumorg) + HEY | `rh-preflight` Hermes skill: checks HEY's builder record before a swap | We already have the Hermes plugin. Ask to list Zolva skills next to rh-preflight |
| **priors_trade** | Credit lines for agents with public repayment records | Later, when live agents need credit. Watch |
| **paybox** | Agents in Claude/ChatGPT/Grok trade any token | Possible execution path for "paper to live". Watch only (real money) |
| **ArrowFinance** (upcoming) | Agent that loops and rebalances stock-token positions | Watch. Fits next to Longbow |

### Skipped (token-first, tiny reach, or competitors)
- Prysm AI, a scored agent league: 15 followers and a direct competitor.
- Dewline, stock-token gap alerts: 11 followers.
- Loxley, Agentdom, Agesic, Orbio, Locksley: new token launches, each under 500 followers.
- Letronna: Rust agent cloud, no fit.

## Glint (tradeglint.xyz, @glint_trade), checked 2026-11-14: direct competitor
- **Same pitch:** "Describe a strategy in plain words. An AI agent trades it, inside limits you set." Also "The AI proposes. Code decides."
- **Venue:** real money on Lighter's Robinhood Chain spot exchange (tokenized stocks, ETFs, ETH in USDG).
- **Five presets:** DCA, Protect, Trend, Rebalance, Momentum.
- **Safety and fees:** a risk engine; the Lighter key signs trades only, with withdraw locked; an on-chain receipt per trade; no trading fee.
- **Marketplace:** sell an agent, keep 98% (2% platform fee). The strategy is visible before purchase.
- **Developer access:** MCP server (Claude Code, Codex), REST API, open-source core at github.com/GlintTrade/glint-core (1 star, no clear license, org created 11-12).
- **Size:** X account created 2026-11-08, 86 followers. Token on fomo (CA 0x113f…3114).
- **What we have that they don't show:** paper trading, backtests on hourly history, a 24/7 record since 2026-10-15, perps, an ERC-8004 identity, MCP Registry 1.1.0.
- **What they have that we don't yet:** self-serve real money, a marketplace, a per-trade on-chain receipt.
- **Verdict:** no collab, since it would send users to a competitor. Watch them. Ideas worth noting for the owner and Dev: an agent marketplace, and an on-chain receipt per decision (the Upoch idea).
- **Ideas to adopt (owner to pick; Dev and Brand would own them):**
  1. DCA and Rebalance strategy types. These are the simplest strategies for everyday users. They touch the engine, so `runHour` and the prototype must change together.
  2. A landing-page story along the lines of "AI suggests, rules decide", plus a step-by-step pipeline visual. Write our own words; don't copy theirs.
  3. A plain-words summary of every rule before an agent starts.
  4. A trust line for live agents: Zolva can trade but can never withdraw. Check this against the Privy policy first.
  5. On-chain receipts: a daily hash of all decisions.
  6. Later: a marketplace or paid templates. Our "Use these rules" copy is free today.

## Texel (texel.run, @texelrun), checked 2026-11-14
- **What it is:** an "onchain GPU cloud" on Robinhood Chain. GPU rental by the second (RTX 2000 up to B300; the list looks like a resold provider) and ready media models at ~30% under list price:
  - image: FLUX, Qwen, Seedream
  - video: WAN, Seedance
  - voice: MiniMax Speech, Chatterbox
  - 3D: TRELLIS
- **Payment:** USDG credits, any token swapped to USDG, x402 per request (an agent signs one USDG authorization, no account or key), $TEXEL with an hourly burn, or "the yield of your stocks" (deposit NVDA).
- **Other features:** an on-chain receipt per job, and a per-agent spend cap with a kill switch.
- **Size:** X account created 2026-10-14, 430 followers.
- **Fit:** Zolva needs no GPUs, and our AI calls go to Anthropic. The real overlap is our **marketing media**: X videos use MiniMax voice-over (~$0.04), ElevenLabs music and gpt-image-2. Texel sells MiniMax Speech and FLUX, cheaper and paid in USDG on our own chain.
- **Cheapest real step:** use Texel x402 for the next voice-over or image in `video/remotion/scripts` (cents). Then post "this video was voiced through Texel, paid per request in USDG on Robinhood Chain" and tag @texelrun. Both of us sell x402 on Robinhood Chain (our premium API), so a small "x402 on Robinhood Chain" angle works too. It is a listing or usage, not a partnership.
- **Caveats:**
  - Media quality and model parity must be checked against our current MiniMax voice before switching.
  - Paying needs a USDG wallet. That is the owner's money; ask first and state the cost.

## Verify line for listings and DMs (2026-11-16, Grok plan item 6, owner approved)
Use it in new listings, descriptions and partner DMs where it fits. Do not re-submit forms just to add it. The owner sends everything.
- **Long:** Any Zolva agent can be verified: the real engine replays it against the stored hourly prices and checks that every logged decision matches. Do it on the agent page, through GET https://zolvaagent.app/api/public/v1/agents/{id}/verify, or with the MCP tool verify_agent.
- **Short (DMs, tweets):** Every agent's log can be re-checked: the engine replays it against stored prices (agent page, /api/public/v1/agents/{id}/verify, MCP verify_agent).
- **Token questions** ("what does ZOLVA do"): the public ZOLVA report, https://zolvaagent.app/token/report, lists every burn with its transaction.
- Both checked live 2026-11-16: the verify endpoint and /token/report return 200.
- Where it goes next:
  - the Autonomo DM (unsent)
  - the Cursor Directory description, at the next edit after the rescan
  - the mcp.so issue, only if they ask for details
  - the TradingAgentStack reply to Ahsen (optional P.S., it helps his Safety score)
  - any later x402fi or AlphaMorph message
