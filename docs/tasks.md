# Tasks

See [mvp-plan.md](mvp-plan.md) for scope and decisions.

## Open now (cleaned up 2026-10-28)

Everything still open, in priority order. Details are in the sections below.

**Perps ([perps-plan.md](perps-plan.md), [perps-research.md](perps-research.md))**
- [x] Phase 0: research Lighter, Arcus and other venues that list stock perps. Done 2026-11-07, gate passed with Lighter RH (71 perps on Robinhood Chain, 0% fees, USDG, keys can't send funds to others): [perps-research.md](perps-research.md)
- [ ] Owner: read Lighter's terms of use and confirm the owner's region is allowed (before Phase 3)
- [x] Phase 1: backtest on Lighter RH candles and real funding (scripts/research-perps.mts). Done 2026-11-07: gate FAILED. Scalping (1 to 2 h holds) loses; mean reversion loses in strong trends; closest is Dip + fade on crypto (positive 4 of 5 windows, 10% worst drop). See perps-research.md
- [x] Perps trend filter backtest (2026-11-07): helps crypto at 5% only (Dip + fade +12.2%, worst drop 6%, -2.8% in the rising month; Swing +23.3%), but 3% and 8% are worse, so it may be overfit. Stocks: noise. Gate still failed
- [x] Rule search with a held-out month (2026-11-07, scripts/research-perps-search.mts): 5,580 combinations, 323 robust on training; of 3 locked in, only **deep dip on BTC ETH SOL** (z < -2.5 vs 96h average, sell at z >= 0.5, 5% stop) passed the held-out month (+1.7% vs holding -14.1%, drop 4.4%). Long only, ~2 trades a week
- [x] Phase 2 code (2026-11-07, not committed or deployed yet): perps as markets with venue `lighter` (`lighter:<id>`, symbols end in -PERP), migration 20261107000200_lighter_perps.sql (tokens.venue and lighter_market_id, candles.funding_rate, BTC/ETH/SOL-PERP, agents_venue_guard: one venue per agent, perps never live, candle_closes with venue and funding). Engine: venue perps pays PERPS_COST_RATE 0.05% and hourly funding taken from the position itself (prototype parity + tests); z score 96h in custom rules. Hourly ingest step 3 reads Lighter's last day (lib/prices/lighter.ts); `npm run backfill -- BTC-PERP ETH-PERP SOL-PERP` loads history. getMarket hides perps unless asked (runner and agent pages ask), so market lists, Studio, Swap and the APIs do not show them. Lab · Perps Deep Dip in LAB_AGENTS (seed:house). Engine check on Lighter history (scripts/research-perps-engine-check.mts): +13.9% training, +2.7% held-out month, matching the search
- [x] Phase 2 live (2026-11-08): migration applied (perps added disabled, enabled after the deploy), backfill 3,233 hours each with funding, deployed (health 200), Lab · Perps Deep Dip seeded (agent 407eb4b0). First tick 13:00 UTC ran all 28 agents; perps hidden from /markets, /studio and the public API, shown on the agent page
- [x] Agent page (2026-11-10, not deployed): Decision log capped at 560px and Latest decision at 400px, each scrolling inside its card with a bottom fade until the end (ScrollArea in AgentView, .log-scroll). Perps agents now say "0.05% cost each plus hourly funding" under Trades
- [x] Live executor approve gas (2026-11-10): approve now uses estimateGas + 30% with a 100k floor (approveGasLimit), like the swap. The fixed 100k was rejected as "intrinsic gas too low" on 2026-11-05 (Live CRCL RDDT GME, RDDT sell), the likely cause of the 2026-10-29 "Missing or invalid parameters" approve failures
- [x] Lab · Perps Deep Dip Alts (2026-11-10): same rule on HYPE ZEC XRP LIT NEAR perps (max 20%, stop 5%), migration 20261110000100_lighter_alt_perps.sql (5 perps, perps agents may watch up to 10 markets). Backtest on markets the search never saw: +19.4% Jul 8 to Nov 10, +10.8% last 30 days vs holding -16.1%. Stocks (-3.3%) and gold/silver (-3.2%) do not carry the rule
- [x] Spot / Perps filter (2026-11-10, not deployed): /leaderboard and /agents filter All · Spot · Perps (replaces the strategy tabs and Stocks/Crypto; strategy and markets stay searchable on /agents), Perps and Short pills on rows and cards (components/app/AgentKind.tsx), AgentSummary.venue and .shorts, "Beat holding most" now "Beat holding", leaderboard column Stocks now Markets. Perps agents no longer offer "Use these rules" (the Studio builds spot only)
- [ ] Watch Lab · Perps Deep Dip 2 to 3 weeks against the backtest (about 2 trades a week expected; ~2026-11-28 compare with the fresh-hours re-test)
- [ ] Follow-up: public_stats counts perps in "markets" (stats page says 25 while /markets lists 22)
- [ ] ~2026-11-28: re-run on fresh hours only: the deep dip rule above, plus the frozen Dip + fade and Swing (BTC ETH SOL, TREND_FILTER=0.05) (WINDOWS=21:0 after refreshing the cache), next to the Lab agent's live paper record
- [ ] Scalping on the DEX: not viable at 0.3 to 0.5% per trade (2026-11-07); revisit only with perps

**Before announcing wider**
- [ ] Privy allowed origins: add https://zolvaagent.app and https://www.zolvaagent.app (owner, Privy dashboard), plus http://localhost:3000 for local dev
- [ ] Workers observability/logs on (`observability.enabled` in wrangler.jsonc)
- [ ] Newsletter form: connect an email provider or remove the form
- [ ] Confirm the excluded-countries list (US + likely UK, CA, CH, AE) and the geo-block
- [ ] Check Privy pricing for monthly active users
- [ ] Check logged-in views in dark mode (owner, needs a login)
- [ ] Dashboard: the live agent card and the "Paper balance" total do not say real money yet (live agents count as paper there)
- [ ] Live agent "Live BTC ETH" auto-paused (2026-10-29 20:00 UTC): both $5 buys (BTC, ETH) failed when the Worker sent the approve ("Missing or invalid parameters" from the RPC); no funds moved. The same approve sent locally on 2026-10-30 confirmed (0x57f2…aada), and the same approve sent from inside the Worker on 2026-10-31 also confirmed (0xbc5c…4938), so the failure did not reproduce and its cause is still unknown. Fixed: order errors now keep the RPC reason and never the RPC URL (it held the Alchemy key; the two stored rows were cleaned). Next: deploy, resume, read the real reason if it fails again
- [x] Aggressive live agent (2026-10-31): "Live CRCL RDDT GME" (5e977d7d), momentum, $10, max 34% per token, stop 20%, replaces the paused "Live BTC ETH" on the same wallet. Backtest with 0.5% cost: -16.2% over 30 days, -15.6% over 60, 24 trades in 30 days. live:agent takes --max and --stop
- [x] Down market research (2026-11-03): docs/down-market-research.md, scripts/research-down-market.mts. Rotation lost in every window; dip buying across all 14 live markets (one position, deepest z < -2.5) stayed ahead of holding in the falling month and was positive in all 3 windows at 0.3% cost or less (at 0.5% it only lost less than holding)
- [x] Dip hunter strategy (2026-11-03): preset dip_hunter in runHour + prototype/engine.js (parity and behaviour tests), up to 20 markets for this strategy only (migration applied), labels and co-pilot description; not in Studio. Paper agent "Lab · Dip Hunter" (14 live markets, 100%, stop 10%) via seed:house after the deploy
- [ ] Dip hunter: review the paper agent after about 2 weeks (vs holding the same 14 markets) before any real money
- [x] Shorting research (2026-11-03): docs/shorting-research.md. Morpho on Robinhood Chain lends stock tokens against steakUSDG (NVDA $17k available, SPY/SPCX/MSTR/QQQ about $1k, TSLA/GME/PLTR about $0.4-0.6k, all allowlisted addresses); perps via Lighter/Arcus are off the executor's path
- [x] Shorting backtest (2026-11-03): scripts/research-shorting.mts, trend short, spike fade and dip long + fade short on the 8 borrowable markets all lost money (best: trend short -4.5% while holding fell 8.2%; -29% over 60 days). Not building shorting now; re-test with more history
- [x] Spike fade shorts, paper only (2026-11-03): engine + prototype parity, short/cover trades, positions.side, live agents refused (agents_live_no_shorts). Lab · Crypto Spike Fade (ETH, BTC). Backtest over BTC history: +7.5% in 45 days while holding fell 10% (0.1% cost), only 9 shorts
- [ ] Spike fade: review the paper agent around 2026-11-24 (few signals: about 1 short every 5 days)
- [x] Public API v1 (2026-11-04, deployed; modelled on Oreno's but versioned, one error shape, limits): GET /api/public/v1/agents, /agents/{id}, /markets, /markets/{symbol}, /activity. No key; published paper agents only (private and live agents are 404); decision reasons for the last 24 hours only; no wallets, AI usage or prompts. Shapes in lib/public-api/format.ts (tested), plumbing in lib/public-api/http.ts: Workers Cache API (60 s markets/activity, 300 s agents), CORS open, 60 requests a minute per IP via the PUBLIC_API_LIMITER rate limiting binding (wrangler.jsonc; skipped in next dev). Docs page /docs/public-api. Cache hits re-set our Cache-Control (Cloudflare otherwise sends a 4 hour browser TTL); X-Zolva-Rate-Limit on/off shows whether the limit ran. Limit verified in wrangler dev (60 pass, then 429)
- [x] Public API checked on production (2026-11-04, second deploy): cache hits keep max-age=60/300, X-Zolva-Rate-Limit: on. Cloudflare's limiter is approximate: 400 parallel calls in 17 s gave only 4 x 429 (counts are per server, synced with a delay), so the cache, not the limit, is what protects Supabase. Docs now say "about 60 a minute"
- [x] Landing page copy (2026-11-04): hero "Trading agents for stocks and crypto", stat "Markets", markets section counts stocks and ETH/BTC apart, FAQ says real money is not open to users yet (testing with our own wallet) and adds "Can agents trade crypto?", What's next: real money card "In testing" with "Now: live with our own wallet, first trades filled on chain". No mention of legal review (owner's choice). Deployed 2026-11-04 (55f28c9)
- [x] MCP server (2026-11-04): https://zolvaagent.app/mcp, Streamable HTTP, stateless, read-only, no key; official SDK @modelcontextprotocol/sdk 1.32.2 (+ zod 4.6.7). Tools list_agents, get_agent, list_markets, get_market, recent_activity, all read-only; same loaders (lib/public-api/data.ts) and edge cache as the REST API, same per-IP limit. Filters tested (lib/public-api/tools.ts). Checked with the SDK client in next dev and in wrangler dev. Docs /docs/mcp (Claude, Claude Code, Cursor). Deployed 2026-11-04 (55f28c9); production checked with the SDK client: 5 tools, live agent refused
- [x] Live agent value fix (2026-10-30): the live runner recorded the paper engine's equity for the hour, which already paid the 0.5% cost of planned buys, so the two failed buys showed as -0.5% (equity 9.95 at Oct 29 20:00). It now records liveEquity (cash plus held positions at the close); the 20:00 row was corrected to 10. Deployed 2026-10-30
- [ ] Manual check of the AMC token (its old pool was against a spam-looking token)
- [x] Make the GitHub repo public (2026-10-29; HEAD cleaned of private hostnames, local paths and a sample email first, older commits still contain them)
- [x] X account [@zolva_agent](https://x.com/zolva_agent) linked (2026-10-29): footer icon, app sidebar link, Dashboard "Follow" card (`lib/social.ts` X_URL)

**Product**
- [ ] Lab review around Nov 1 to 12: which strategy beats holding per basket; decide the presets
- [ ] 9 more coins (SOL, BNB, HYPE, XRP, TRX, ZEC, DOGE, NEAR, XMR) from Chainlink on Arbitrum (TRX on BNB Chain): waiting for Arbitrum and BNB Chain to be enabled on the Alchemy app
- [ ] Self-serve AI credit top-up (USDG on chain); paid models are unusable without it
- [ ] Agent page: show the strategy prompt and per-agent AI spend; Activity: show AI verdicts
- [ ] Docs: Contracts page (token, pool and feed addresses from the `tokens` table)
- [ ] Markets: hide the "US market open/closed" line on the Crypto tab; label off-hours (DEX only) prices

**Token and launchpad**
- [ ] Zolva token on Pons: ticker, then CA, Dex link and burn tx in the drafts, and the launch video
- [x] Token utility, ready before launch (2026-11-04): holder tiers in lib/tiers.ts (Free/Holder/Pro at $25/$150, 7 day average price, 3 day grace), lib/membership.ts (balances of the login wallet plus signed extra wallets, read every 10 min; hourly ZOLVA price from GeckoTerminal in the cron), tier limits on active agents (database), strategy writer tries and free hourly Lite AI reviews (ai_settle_covered), Dashboard "ZOLVA membership" card, /docs/token. Off until ZOLVA_TOKEN_ADDRESS is set
- [x] Pay for AI credits with ZOLVA (2026-11-04): the wallet (browser wallet, or Privy for email/Google accounts, now configured for Robinhood Chain) sends ZOLVA to 0x…dEaD; /api/credits/zolva checks the receipt (success, under 24 h, from the account's wallets, Transfer to the burn address), values it at min(latest hourly, 7 day average) +10%, minimum $1, and ai_grant_zolva records it once per tx (zolva_topups, ledger kind zolva). Dashboard "Pay with ZOLVA" replaces "Top up · Soon" once ZOLVA is configured. Migration 20261104000200_zolva_topups.sql
- [ ] At ZOLVA launch: put ZOLVA_TOKEN_ADDRESS (and decimals) in .dev.vars, deploy, check GeckoTerminal lists a price, test a holder account. Migration 20261104000100_zolva_membership.sql must be applied first
- [x] HOL plugin catalog (2026-11-06): README MCP setup (Claude Code, Cursor, Claude Desktop, mcp-remote, curl), SECURITY.md, Dependabot; plugin-scanner 3.59.0 on a clean clone 100/100. PR https://github.com/hashgraph-online/awesome-ai-plugins/pull/1191 from the zolvaagent fork (Tools & Integrations), official scan 100/100, merged 2026-11-06 05:57 UTC. Suggested by Kantorcodes (HOL) on X
- [ ] Public API/MCP: optional longer decision window (for example hours=168, default 24), suggested by Kantorcodes; decide how far back to open the reasons
- [ ] Next update idea: "Ask your agent" chat answered from the agent's decision log and real backtests, 3 / 20 / 60 messages a day by ZOLVA tier, no buy or sell advice (plan: docs/ai-and-token-plan.md section 11, "Later")
- [ ] Launchpad contracts with Foundry tests (needs OK to install Foundry), then an audit

**Real money trading** (Phase 3 below)
- [ ] Custody model, executor, invite-only beta with caps and a kill switch
- [x] Export private key (2026-10-29): Dashboard account card for email/Google accounts ("Your Zolva wallet"); a warning dialog with an "I understand" checkbox, then Privy's own window via useExportWallet (Zolva never sees the key). Wallets with a live signer get "Remove Zolva's signer", which removes the signer and calls /api/live/revoke (pauses live agents, leaves the allowlist). Account card says Email or Google login vs Wallet login. Needs an owner test on production (real Privy session)
- [ ] Legal review (owner decided on 2026-10-28 to start building without it first)

**Maintenance**
- [ ] `npm audit` (build tools only), remove the `permissionless.ox` override once Privy updates
- [ ] Watch the first live AI reviews once a user agent has the co-pilot on

## Now
- [x] Research competitor Heurix (heurix.xyz/docs)
- [x] Pick chain (Robinhood Chain) and edge (stock tokens + backtest before launch)
- [x] Phase 0 data check: GeckoTerminal works ([phase-0-findings.md](phase-0-findings.md))
- [x] Candidate token list: 20 stock tokens ([data/stock-tokens.json](../data/stock-tokens.json))
- [x] Name: Pitwise; target users: non-US crypto-native retail
- [x] Brand: Pitwise → Sita → **Zolva** (2026-10-15; final rename done in app, prototype and docs). Folder/package/Worker names still `pitwise`
- [x] Write MVP plan + Phase 1 build plan
- [x] Approve MVP plan (stack: Supabase + pg_cron, hourly prices only)
- [x] Clickable prototype with real prices: `prototype/` (landing, Forge + backtest, agent page, leaderboard, legal, 404). Preview: the `pitwise-prototype` launch configuration
- [x] Fixed price pools: each token now priced from its deepest **USDG** pool (first pick included stock/stock pairs)
- [x] Tuned strategy thresholds on real data (see mvp-plan section 4)
- [x] Go / no-go decision on the prototype: **Go** (2026-10-15)
- [x] Prototype live for design review: its own workers.dev Worker (separate Worker, redeploy with `npm run deploy:prototype`)
- [x] Restyled prototype in aave.com's design language (2026-10-15): Inter, ink #252228, lavender accent, hairlines, 24px cards, pill buttons, expo-out motion, word-by-word headlines, odometer stats, HTML phone mockups, dark strategy cards, growth chart. Tokens taken from Aave's real CSS via the Wayback Machine (aave.com is blocked on this network)
- [x] 6 3D icons with gpt-image-2 (high, ~$0.77; one extra call failed because gpt-image-2 rejects transparent backgrounds). Prompts in `assets/icon-prompts.json`, script `scripts/generate-icons.mjs`; white cut out locally by `scripts/cutout-icons.py`; originals in `assets/icons-original/`
- [x] Agent page: prototype switch "Just now / 7 days ago / 30 days ago" for your own agent; empty states use 3D icons and explain why (e.g. biggest 24h rise vs the 3% rule); decision log shows the latest holds when there are no trades; holdings show a cash bar; charts use a fading fill
- [x] Landing round 3: Aave-style glows (hero lavender glow + dot grid, inset dark panels with purple glow), "Zolva Forge" showcase with an HTML browser mockup of the app, 20-stock market grid with 7-day sparklines, scrolling decision feed, bigger spacing (160px sections, 96px hero, 56px headings), glowing CTA panel
- [x] Prototype: "Go to app" CTA → Privy-style login (Google, email + 6 digit code, wallet: MetaMask/Rabby/Coinbase/WalletConnect), simulated. Email/Google users get an embedded wallet
- [x] Prototype: app shell (sidebar on desktop, top bar + bottom tab bar on phones) for Dashboard, Forge, Leaderboard and agent pages; landing keeps the marketing header
- [x] Prototype: dashboard `#/app` (greeting, paper balance, running agent, all-time return, agent cards, latest decisions, account + wallet card, top agents). Launch requires login first
- [x] Closing CTA redesigned: light lavender glow panel, copy + "Go to app" on the left, fanned stack of live cards (backtest, leaderboard rank, running agent) on the right
- [x] Footer redesigned (Aave style): "Stay updated" email row, Product / Strategies / Legal columns, "Prices updated hourly" status, giant gradient "Zolva" wordmark
- [ ] Newsletter form is front-end only (validation + toast); needs an email provider before launch (also listed under Open now)
- [x] ~~Prototype limitation: agents are stored per browser~~ superseded: the real app stores agents per account in Supabase
- [x] Decided: Privy for login (2026-10-15), replacing viem SIWE in 1.4
- [ ] Check Privy pricing for monthly active users before launch
- [x] ~~Design feedback on the restyled prototype~~ superseded: the design was carried into the real app
- [x] Port the Aave-style tokens + components into the Next app (`app/globals.css`, Inter): done during Phase 1
- [x] ~~Buy `zolva.xyz`~~ superseded: `zolvaagent.app` bought and connected 2026-10-19. The X account is still to be created (see Open now)
- [x] Decided 2026-10-28: keep the internal `pitwise` names; the brand only shows as Zolva and renaming the Worker would touch domains, crons and secrets for no user benefit
- [x] Zolva logo for now (2026-10-16): the "Watcher" mark, a glossy lavender orb with one eye glancing up and right (gpt-image-2 concept, background cut out locally). `public/img/brand/zolva-mark.png` everywhere the old S icon was, plus `favicon-48.png`, `apple-touch-icon.png`, and X avatars `assets/x/x-avatar-400-ink.png` / `-light.png`. Other concepts and monogram options are in `assets/brand/` for a later final logo
- [x] New Zolva logo (2026-11-04): the owner's Figma Z badge (assets/brand/logo-v2), white on the G1 "midnight violet" gradient (#15103a to #2e2490 to #6a5ef5, lavender glow). The favicon (16 to 48px) uses S1 without the triangle (scripts/logo-small.mjs); the site header and badges keep the full logo, at the owner's request. scripts/render-brand.mjs writes zolva-mark.png (512), zolva-mark-small.png (header and badges), favicon-48, apple-touch-icon, public/icon.svg, plus x-avatar-400 and token-1000 (and -bright) in assets/brand/logo-v2. The old orb is kept as assets/brand/zolva-orb-*.png. X avatar and token image are for the owner to upload
- [x] Tab title and share meta (2026-11-04): home tab "Zolva | Trading agents that show their work" (other pages "<page> · Zolva"), new description, Open Graph and X card (summary_large_image, @zolva_agent) with public/og.png (1200x630, from assets/brand/og-image.html)
- [x] X house style (2026-11-04): Morpho style (soft blurred lavender field, small white lockup), picked from a sheet of 11 real banners and 6 rendered directions. Header assets/brand/banner-v4/morpho-banner.png, P18 card morpho-p18.png, script build-morpho.mjs (CSS only). Owner uploads the header
- [x] Logo reveal video (2026-11-04): video/logo-reveal/zolva-logo-reveal-1920x1080.mp4, 16 s Remotion (video/remotion/src/LogoReveal.tsx, npm run render:logo-reveal), Morpho style, cut to a new 120 BPM Lyria track (one paid call, about $0.06; a first prompt was rejected unbilled), trimmed 405 ms so beats land on the cuts. video/ is gitignored, so the source stays local
- [x] Logo refresh video v2 (2026-11-04): the owner found the hype version and its music too loud ("alay") and picked a reference (a clean brand refresh reveal). video/logo-reveal/zolva-logo-refresh-1920x1080.mp4, 10 s, white background, one word per beat, the orb turning into the Z; src LogoRefresh.tsx, npm run render:logo-refresh; calm Lyria track (about $0.06), trimmed 60 ms to the beat
- [x] Trading showcase video (2026-11-04): video/trading/zolva-trading-15s-1920x1080.mp4, 15 s Remotion (src/TradingShowcase.tsx, npm run render:trading). Script from the live site: hook, 24/7 agent, real TSLA buy (chart stops at the decision), four real decisions, agent vs holding +2.8 pts (7 days, paper), leaderboard, logo build. Audio v2 (owner found the old music and ffmpeg sound effects bad): music only, a new 16 s ElevenLabs Music track via Replicate (public/music-eleven-trading.mp3, 120 BPM, about $0.13); sound effects removed (public/sfx kept, unused). Final audio normalized to about -16 LUFS
- [x] README.md on the public repo (2026-11-06, commit 7b6ce91): what Zolva is, how the hourly engine works, public API and MCP, stack, layout, local setup, contributor rules, disclaimer. MIT LICENSE added the same day (copyright holder "Zolva"; name and logo excluded)
- [x] /agents directory (2026-11-06, commit 9ba6a39, deployed and checked live): Explore > Agents in the sidebar and mobile tab bar (6 tabs now). One card per active public agent: strategy and markets, return, vs holding, 7 day sparkline, what it holds now, the latest hour's decision with its reason, the last trade. Sort (traded last, newest, highest return), Stocks/Crypto filter, search by name, strategy or market. "Use these rules" opens /studio?from=<id> prefilled (strategy, rules, markets, max per stock, stop loss); only for Studio strategies with 3 markets or fewer, so no button on Dip Hunter and Spike Fade. /agents/<id> pages now highlight Agents in the nav instead of Dashboard. Code: lib/data/agents.ts (listAgentCards, getAgentTemplate), components/app/AgentDirectory.tsx, app/(app)/agents/page.tsx
- [x] Manual swap in /app (2026-11-06, commit e8ffa46, migration applied, deployed; moved the same day to its own page /swap under Explore, sidebar only, with a Swap link on the Dashboard; then redesigned like a DEX swap card: Sell and Buy panels, flip, token picker with the wallet's balances and USD values, Half and Max, any pair (two hops through USDG when neither side is USDG), quotes work logged out; later: a 7 day chart of the bought token and the wallet's latest transactions with Zolva's tokens from chain logs, beside the card; fixed after a test swap: the paused CRCL RDDT GME agent's GME reduced by 0.06998 as an owner withdrawal, since that swap went to ETH on /swap and not through Sell) (USDG <-> one allowlisted v3 market, QuoterV2 quote via /api/swap, exact approval then SwapRouter02, signed by the user in Privy or the browser wallet; warning above 2% from the hourly close). Live agent holdings get a Sell button (owner only) that sells the position and records it through /api/live/manual-sell + record_manual_sell (reason manual; amounts read from the Transfer logs). Needs migration 20261106000200_manual_sell before Sell can record. Quote checked live (10 USDG -> 0.00449 ETH at 2225.25); the signing flow is untested until the owner tries it. 2026-11-07: official USDG token logo (32x32 from globaldollar.com/brand, public/img/coins/USDG.png); note under the swap card removed
- [x] Public /stats page (2026-11-07, sidebar only): headline counters (decisions, agent hours, simulated volume, real trades), real money proof with Blockscout links and last tick, decisions per day (30 days), most traded markets, strategies running, "Built, not promised" infra row. One SQL call `public_stats()` (migration 20261107000100_public_stats, applied 2026-11-07), loader `lib/data/stats.ts`. Every number is real; paper volume is labelled simulated. Checked in the local preview; counter roll animation only plays in a visible tab
- [ ] Zolva sound set (later, owner idea 2026-11-08): our own short SFX kit (rise, land, tick, pluck, click, chime) so videos stop relying on Kenney CC0 stock sounds. The stats video (video/stats/zolva-stats-1920x1080.mp4, cues in video/remotion/src/StatsVideo.tsx CUES) is the first user; swap the files in public/sfx-kenney when the set exists
- [x] Larpcheck gaps (2026-11-06, see docs/larpcheck-readiness.md; commit 9eb5aa6, deployed and checked live): landing roadmap now says Live / In testing / Planned, not built (launchpad preview marked as a design, contract claims in future tense) and links proof; new docs page /docs/verify (status of every claim, code, public API examples, prices, real money wallet and agent, official accounts, "no token yet" warning), linked from the footer; live agent "Live CRCL RDDT GME" published (page public with Blockscout tx links; still off the leaderboard, Agents, activity feed and public API, which stay paper only); recent trades feed filters mode = paper; X wording rule for verifiable claims in docs/x/profile.md
- [x] Premium API over x402 (2026-11-06, OPEN: first real payment settled, tx 0x66be4c1e…33fc, 0.9 s; settle gas about $0.0049, nearly the whole $0.005 scan price, scan price raised to 0.02 USDG the same day): GET /api/x402/v1/scan (0.02 USDG) and POST /api/x402/v1/backtest (0.03 USDG), free index GET /api/x402/v1, docs /docs/premium-api. Own facilitator (lib/x402): EIP-3009 on USDG (domain "Global Dollar" v1, checked on chain), nonce claimed in x402_payments before settling, relayer = Privy server wallet under a policy that only allows USDG.transferWithAuthorization to X402_PAY_TO. Closed (503) until X402_ENABLED=1. 15 tests; locally checked 503, 402, 400 and a signed payment refused for no USDG. To open: (1) migration 20261106000100_x402_payments applied 2026-11-06 (empty, RLS on), (2) owner gives the receiving address, (3) npm run x402:setup -- <address>, (4) send the relayer ~$5 ETH, (5) X402_ENABLED=1 + deploy, (6) fund the test payer with ~$0.10 USDG and run npm run x402:pay
- [x] Verify 20 token addresses against Robinhood's official Stock Token list (2026-10-15): all 20 match active assets in `GET https://api.robinhood.com/rhj/assets` (194 tokens on chain 4663). `tokens.verified_official` set (migration `verify_official_tokens`); market pages show a verified note. Tokens carry a small `currentMultiplier` (ERC-8056 corporate actions, up to 1.0027), so a token price can sit slightly above the share price
- [ ] Confirm excluded-countries list (US + likely UK, CA, CH, AE)

## Phase 1: Paper-trading MVP
- [x] 1.1a App setup: Next 16.4 + Tailwind 4 + OpenNext Cloudflare, standard env + Supabase client, `/api/health`, design tokens from prototype. Lint, type check, `next build` and OpenNext build all pass
- [x] 1.1b Schema + token seed SQL in `supabase/migrations/` (seed regenerated with USDG pools)
- [x] 1.1c Supabase project `sita` (ref `kjifgddikkofazmndlxu`, Singapore, free, Vercel org) created via connector; `init` + `seed_tokens` migrations applied; 20 tokens, RLS on, mode trigger tested; URL in `.dev.vars` ([supabase-setup.md](supabase-setup.md))
- [x] 1.1d Secret key in `.dev.vars` (new `sb_secret_` format); local `/api/health` returns `{ ok: true, tokens: 20, candles: 0 }`. **Session 1.1 done** (2026-10-15)
- [x] 1.2 Price data (2026-10-15):
  - `lib/prices/geckoterminal.ts` client (OHLCV + multi-pool prices), 15 Vitest tests
  - Backfill `npm run backfill [SYMBOL...]`: 33,255 hourly candles for 20 tokens (Jul 9 to Oct 15), `tokens.history_start` set, re-runnable
  - `POST /api/cron/tick` (secret in `x-cron-secret`, constant-time check): 1 snapshot call for all 20 tokens closes the last hour, plus OHLCV repair of 2 tokens in rotation (each token every 10 h). ~17 s. Snapshot never overwrites a real candle (`candles.source` = ohlcv | snapshot, migration `candle_source`)
  - Redesigned after measuring: one OHLCV call per token got 429 on ~half the calls even 6.5 s apart (tick took 238 s)
  - pg_cron SQL ready in `supabase/pending/hourly_tick_cron.sql`; apply in 1.6 after deploy (needs Worker URL + Vault secret)
- [x] 1.3 Engine (2026-10-15):
  - `lib/engine/series.ts`: hourly close series with forward-fill and a backward-looking outlier filter (>15% off the median of the last 24 accepted closes is ignored unless it holds 3 hours; a confirmed jump restarts the median)
  - `lib/engine/strategies.ts` + `engine.ts`: `runHour` (one agent, one hour, pure) is shared by the live tick and `simulate` (backtests); paper fills now, executor seam for live later
  - 40 Vitest tests, including exact trade-by-trade parity with the approved prototype engine
  - `npm run backtest`: 3 separate 30-day windows on real Supabase candles. Both strategies still lose to holding (momentum −2.0% vs +2.6%, mean reversion −1.5% vs +2.6% in the latest month). Thresholds kept: further tuning on ~3 months would be overfitting
  - Outlier filter proven on spiky tokens: RDDT momentum −3.5% with filter vs −41.2% without
- [x] Agent runner (2026-10-15): `planAgentHours` (pure, catch up capped at 168 h) + atomic idempotent SQL `apply_agent_hour`; hooked into `/api/cron/tick`. Resume skips paused hours
- [ ] Product decision still open: strategies lose to buy and hold in every window tested so far (decide at the lab review, see Open now)
- [x] Multiple agents per user (2026-10-15): DB trigger caps active agents at 5 paper / 1 live per owner (tested: 6th and resume-at-limit blocked, rolled back). Prototype: launch shows "agent N of 5", blocks at 5, no auto-pause; "My agent" nav replaced by Dashboard; leaderboard lists all your running agents
- [x] 1.4 Production app (2026-10-15): wallet sign in (SIWE, signed httpOnly cookie, nonce replay blocked), geo-block US/CU/IR/KP/SY at sign in and launch, terms stored, Forge with presets + rule builder (custom strategies: price/SMA/high/low/change/z-score/RSI, ALL/ANY, take profit, max hold), backtest card, up to 5 running agents
- [x] 1.5 Dashboard, agent page (equity vs holding, trades, decisions, pause/resume), leaderboard; 5 house agents "by Zolva" seeded (`npm run seed:house`). Landing shows real backtests labelled as backtests
- [x] Local E2E on next dev: 12/12 checks pass (auth, replay, invalid rules, launch, 6th agent refused, pause/resume, stranger refused). 64 tests, tsc, eslint clean
- [x] Worker runtime check (wrangler dev): every route 200/404 as expected, cron handler runs ingest + agents. Fixed a 500 on all routes by upgrading OpenNext 1.20.11 → 1.20.12 (Next 16.4 added `preview-props.json`)
- [x] Hourly schedule: Cloudflare cron (minute 5, `custom-worker.ts`) + pg_cron backup (minute 7, set by the deploy script via `configure_hourly_tick`). Tick is idempotent, so two callers are safe
- [x] 1.6 Deployed to the Worker's workers.dev URL (2026-10-15, version 6f16ef52). Live checks: all pages 200, health ok, cron tick refuses no-secret calls, wallet login E2E pass on production (test wallet removed), Privy active (forged token 401), pg_cron `sita-hourly-tick` active at minute 7, Cloudflare cron at minute 5
- [x] Soak passed: agents have run every hour since 2026-10-15 (about 290 runs each by 2026-10-28, no gaps)
- [x] Privy email + Google login built (2026-10-15): Privy loads in the browser only (keeps the Worker at 1.4 MB gzip), creates an embedded wallet for each user, `/api/auth/privy` verifies the access token with Privy and starts the same session cookie as wallet login. Off until keys are set; wallet login unchanged and retested on the Worker
- [x] Privy app created, keys in `.dev.vars` and Worker secrets, production domain in allowed origins (2026-10-15)
- [x] Privy end-to-end on production (2026-10-15): real email/Google login created embedded wallet session, wallet row saved with country ID. First attempt failed for unknown reasons (no logs kept)
- [ ] Turn on Workers observability/logs so failed logins can be diagnosed (`observability.enabled` in wrangler.jsonc)
- [ ] package.json override `permissionless.ox = $ox`: Privy pulls permissionless, whose optional ox@0.8 peer clashes with viem. Remove once Privy updates

- [x] Forge dropdowns (2026-10-15): native `<select>` replaced by `components/ui/Select.tsx` (listbox popover in a portal, keyboard + type-to-jump, flips near the screen edge, 8px gutter on mobile, plain language hint per option). Deployed (version 96959b7a)
- [x] Production price ingest fixed with on-chain prices (2026-10-15, version 66e225eb). GeckoTerminal answered 429 to most calls from Cloudflare's shared IPs. Now:
  - `lib/prices/onchain.ts`: each hour's close = the token's stock/USDG pool price at the last block before the hour ends (v3 `slot0`, v4 `extsload` on PoolManager `0x8366…0951`), one Multicall3 call for all 20 tokens, block found by binary search (~0.7 s). 8 Vitest tests
  - Ingest fills every hour of the last 24 that a token is missing (never overwrites), so missed ticks heal themselves. GeckoTerminal OHLCV repair kept as best effort: no retries, logged as warnings, does not fail the tick
  - Migration `onchain_pools`: `tokens.pool_kind`, `stock_is_token0`, `token_decimals`; candle source `onchain`. AMC, MU, TSM moved to direct USDG pools (were AMC/MEME, MU/SPY, TSM/SPY); all 20 prices matched GeckoTerminal within 1.4%
  - Proven on production: tick from the Worker re-read a deleted GME candle from chain with the identical value. RPC URL is a Worker secret (`ROBINHOOD_RPC_URL`), never logged
- [ ] AMC's old pool was against a spam-looking "MEME" token (501 pools, most empty). Worth a manual check of AMC's token itself before launch

- [x] Zolva Lab research agents (2026-10-15): 10 extra paper agents under two lab owners (`LAB_WALLETS`, each capped at 5 like any user), labelled "by Zolva", not on the landing page. Experiment A: NVDA/TSLA/AAPL with momentum, mean reversion, breakout, RSI dip and trend filter side by side. Experiment B: Big Tech RSI dip (vs the Big Tech Momentum house agent), Gold & Oil momentum, Crypto stocks dip, Asia trend filter, Growth breakout. RSI dip and trend filter rules were calmed for trade count (14h RSI traded ~45 times a month, a +1% trend rule 55-80) before launch, not tuned for return. All 15 Zolva agents lost to buy and hold in the last three 30 day backtests
- [ ] Review the lab after 2-4 weeks of live data: which strategy (if any) beats holding per basket, trade counts, drawdowns. Decide what to keep as presets

- [x] Markets pages (2026-10-15, version 6d249037): `/markets` lists all 20 stocks (price, 1h/24h/7d change, 7 day sparkline, agents trading it, build button; All/Top gainers/Top losers tabs, search; cards on phones; extra columns only from 1200px). `/markets/[symbol]` has a 24h/7d/30d chart, stats (30d change, 7d high/low, typical hourly move), the agents trading it, token and pool links and the "not yet verified" notice. "US market open/closed" badge on both. Added to the app sidebar, phone tab bar (now 4 items), site header and footer. Stats in `lib/markets.ts` with 6 tests
- [ ] Add `http://localhost:3000` to Privy allowed origins (only production is listed, so the Privy iframe is blocked in local dev)

- [x] Activity report `/activity` (2026-10-15, version c5543c87): last 24h totals (agent checks, buys/sells, paper volume, most traded), then an hour-by-hour log of the last 48 hours with every trade, its price, amount and the agent's own reason; quiet hours collapse into one line; filters All / By Zolva / Community. One SQL call (`agent_activity` RPC, server-only). In the sidebar, phone tab bar (5 items) and footer. Logic in `lib/activity.ts` with 4 tests

- [x] Real company logos (2026-10-16): 16 stocks show their logo (`public/img/stocks`, list in `lib/stock-logos.ts`) in markets, activity, landing and the Forge stock picker; ETFs (SPY, QQQ, GLD, USO) keep the monogram. Source FMP image-stock, each checked by eye (ticker lookups can pick the wrong company: Parqet returned a SPAC ETF for SPCX); margins trimmed so logos fill evenly. Robinhood's own logo CDN is unreachable from this network (TLS intercepted), GeckoTerminal only has the Robinhood feather

- [x] "Coming soon" teasers (2026-10-16), no dates promised: Forge "Trading mode" with Paper trading (on) and Real money (Soon, not selectable); Markets "Stocks / Crypto (Soon)" switch with an explainer; landing "What's next" section (real money trading, crypto markets). Nothing collects emails yet
- [x] Crypto markets (2026-10-24): ETH (WETH/USDG v3 0.01%) and BTC (cbBTC/USDG v3 0.05%) in `tokens` with `asset_class = 'crypto'` and a `chainlink_feed`; hourly closes rejected when the pool is more than 2% from Chainlink at the same block (`checkAgainstFeeds`); backfilled (ETH from 2026-07-08, BTC from 2026-08-29); Markets Crypto tab, Studio picker groups (stocks and crypto can mix), crypto detail copy, landing card "Live now"
  - [x] Research (2026-10-24, `docs/crypto-markets.md`): ETH (WETH, $18.7M pool) and BTC (cbBTC, $0.2M to $0.7M USDG pools) are the only usable majors; Chainlink has BTC/ETH/LINK feeds but no SOL; recommended pool price plus a Chainlink cross check
  - [x] Crypto lab agents (2026-10-24): third lab wallet `0x…0003` runs Momentum, Mean Reversion, Breakout, RSI Dip and Trend Filter on ETH + BTC (max 50%, stop 10%), live from the 09:00 UTC hour. 30 day backtest to Oct 24 (hold −7.5%): mean reversion −2.5%, RSI dip −2.6%, trend filter −6.1%, momentum −6.7%, breakout −10.5%
  - [x] "Crypto markets are live" video (2026-10-25): `video/crypto-live/zolva-crypto-live-1920x1080.mp4`, 21 s Remotion (`CryptoLive`), music only, -16 LUFS; tweet P12 drafted in `docs/x/tweets.md`, P11 no longer calls crypto "next"
  - [x] cbBTC and WETH addresses match Chainlink's CCIP token directory for robinhood-mainnet
  - [x] Deployed 2026-10-24 and checked live (Markets Crypto tab, BTC page, Studio NVDA + ETH backtest, landing "Live now"); the 11:05 UTC tick is the first with the Chainlink check
  - [ ] Optional: hide the "US market open/closed" line on the Markets page while the Crypto tab is open

- [x] "Forge" renamed to **Studio** (2026-10-16): menu "Studio", page "Agent Studio", URL `/studio`; `/forge` (with its query string) redirects permanently (next.config.ts). Older task notes below still say Forge

- [x] Landing "What's next" redesigned (2026-10-16): dark panel with glows, each card with a small product preview in HTML (Paper/Live switch, wallet, limit slider, stop switch; crypto list with shimmering placeholders, no made-up prices) and an honest "Now:" status line
- [x] Agent page (2026-10-16): pause and resume ask for confirmation and say what happens (open positions are kept but not managed while paused; paused hours are skipped). Owners see "Trade with real money" (Soon), which explains the future flow: a live copy with the same settings (agent mode stays immutable), own wallet, limits, stop switch, paper record kept. Tested end to end with a throwaway wallet, test data deleted

- [x] Workers request isolation (2026-10-16): `db()` no longer caches a module-level Supabase client. Each route and page creates one client per request and passes it to the `lib/` functions, which now take it as their first argument. A shared client let overlapping requests (the cron tick and a page view, or pg_cron and the Worker cron) resolve each other's promises, which Workers cancel. Same fix as an earlier project. viem: the chain client uses no JSON-RPC batching, so its shared URL-keyed batch queue does not apply. Verified in `wrangler dev --test-scheduled`: two Worker crons, a direct `/api/cron/tick` and 8 pages/APIs at once, all 200, all three ticks `ok`, no cross-request warnings

## Phase A: AI co-pilot (plan: [ai-and-token-plan.md](ai-and-token-plan.md))
- [x] Built (2026-10-16), existing strategies untouched: any agent (momentum, mean reversion, custom) can get an AI co-pilot (OpenRouter). When its rules want to trade, the AI approves or passes, with a reason; stop loss, take profit and max hold always run (engine `veto` option). Only the newest hour is reviewed, catch-up hours use rules
- [x] Credits: $0.50 free per account at first login (once, Lite models only), paid credits for Standard/Pro/Max; top-up "coming soon", manual grants with `npm run credits:grant -- <address> <usd> [note]`. Global daily AI budget (`AI_DAILY_BUDGET_USD`, default $5); one review per agent hour claimed in the database before the call, so two ticks never pay twice; out of credits / failure / unreadable answer = rules decide
- [x] Migration `ai_copilot` (agents.ai_model, ai_credits, ai_ledger, ai_usage, ai_grant_welcome/ai_grant/ai_claim/ai_settle/ai_spent_since), tested in a rolled-back transaction. 13 new tests (95 total). Studio model picker with monthly estimates, agent page shows the model and each AI verdict, dashboard credit card. End to end checked with a throwaway wallet (welcome grant, invalid model refused, AI agent saved), test data deleted
- [x] OpenRouter key added; one real Claude Haiku 5.5 review tested on live NVDA closes (1,036 in / 236 out tokens, $0.00022, valid JSON; it correctly passed a buy whose rule reason did not match the data). Redeployed with the co-pilot on (2026-10-16)
- [ ] Watch the first live AI reviews in ai_usage once a user agent has the co-pilot on
- [x] Compact model picker (2026-10-16): one dropdown with provider logos (LobeHub Icons, MIT, in public/ai-logos), tier groups, monthly estimate, locked models; the shared Select now supports icons, meta text, groups and disabled options
- [x] Prompt mode for Custom strategies (2026-10-16): describe the idea in plain words, the AI strategy writer (Claude Haiku 5.5) turns it into rules in the normal rule builder (editable, backtested); the words are saved as agents.strategy_prompt and quoted to the co-pilot on live trades. Paid from AI credits, 10 tries per account per day (ai_generations, ai_generation_start/settle), counted in the global daily budget. Reasoning is switched off for all AI calls (hidden thinking ate the token limit). Live test: Indonesian prompt gave valid rules for $0.0004
- [x] Fix (2026-10-16): accounts that signed in before credits existed never got the $0.50 welcome grant (it only ran at login). `getCredits` now grants it once on first read (Studio, dashboard, strategy writer)
- [x] Publish to leaderboard (2026-10-16): user agents start private (agents.published_at, migration publish_agents). Owners publish or unpublish from the agent page with a confirm dialog; only published agents appear on the leaderboard, landing feed, markets and activity, and a private agent page is a 404 for everyone but its owner. House and lab agents are always published. Leaderboard marks the signed in user rows with "Your agent"
- [x] Dashboard agent cards show Private / On leaderboard (2026-10-16)
- [x] Footer GitHub link to github.com/zolvaagent/zolva (2026-10-16). Social accounts live in lib/social.ts
- [x] Make the GitHub repo public (2026-10-29)
- [x] Repo cleanup (2026-10-29): CLAUDE.md, docs/x, assets/x and video/ are no longer on GitHub (kept locally, listed in .gitignore). Older commits still contain them
- [x] Tweet P13 "code is public on GitHub" (2026-10-29): image assets/x/code-card-1600x900.png, P14 (export key, export-card-1600x900.png) and P15 (docs + dark mode, docs-card-1600x900.png) ready in docs/x/tweets.md (local only)
- [x] Tweet P16 "real money, first fill" (2026-11-01): image assets/x/live-card-1600x900.png from the first live agent fill (GME, 2026-10-31); says owner wallet only, not open to users
- [ ] Choose a license (for example MIT) and add a short README before calling the repo "open source"
- [x] X profile kit (2026-10-16): handles, bios, fields, slogans and wording rules in docs/x/profile.md; banner assets/x/x-profile-header-1500x500.png (rendered free from banner.html); 3 tweet drafts in docs/x/tweets.md
- [x] X content plan (2026-10-16): 3 narrative quote tweets, 2 teasers, launch post with token, Dex paid, dev supply burnt, 10 product posts (docs/x/tweets.md, all under 280), posting calendar (calendar.md), launch video plan with options (video-plan.md). No assets generated yet
- [ ] Token: decide ticker, launch on Pons (check whitelist), then fill CA, Dex link and burn tx in the drafts
- [x] Launch video option B: 2 Grok clips generated (2026-10-16, about $0.91), files in video/clips
- [ ] Launch video edit: screen recordings + the 2 clips + captions + end card (needs ticker and CA)
- [x] Zolva X account created: @zolva_agent, linked in lib/social.ts (2026-10-29)
- [x] Loading skeletons (2026-10-16): loading.tsx for dashboard, leaderboard, agent, markets, market, activity and studio, built from components/ui/Skeleton.tsx on the real layout grids, so the page does not jump; screen reader status line, pulse off with reduced motion
- [ ] Show the strategy prompt on the agent page
- [x] AI limit per agent (2026-10-16): every AI agent has a total spending limit and an end date (7, 30, 90 days or 1 year), set in the Studio (prefilled with about 3 months of typical use) and editable on the agent page. The co-pilot stops at the limit, the date, or when credits run out, whichever comes first; the agent keeps trading on its rules. A limit may exceed the balance (a cap, nothing reserved). Checked in the database by ai_claim_review in the same call that claims the hour (old ai_claim dropped). The one existing AI agent got $0.50 for 30 days
- [x] Whole table rows open their page (2026-10-16): leaderboard, markets and the landing leaderboard use a stretched link, so a click anywhere in a row opens the agent or market (other buttons in the row still work)
- [x] Fix (2026-10-16): Studio said "out of AI credits" after logging in from the Studio page, because it kept its first (logged out) copy of the credits. It now uses the server value and refreshes it after each strategy writer call
- [x] Agent launchpad design approved (2026-10-19, docs/ai-and-token-plan.md section 10); Coming soon card on the landing page and a Launch token (Soon) button on the agent page
- [ ] Agent launchpad: contracts (ZolvaSplitterFactory, AgentFeeSplitter, ZolvaBurner) with Foundry tests, needs OK to install Foundry
- [x] Domain zolvaagent.app connected (2026-10-19): custom domains for apex and www on the Worker, workers.dev kept as fallback, preview URLs off, pg_cron backup and the deploy health check now use zolvaagent.app, OpenRouter referer and share card base URL updated, X drafts and profile use the new link
- [ ] Add https://zolvaagent.app and https://www.zolvaagent.app to the Privy allowed origins (dashboard), or email/Google login fails on the new domain
- [ ] Show AI verdicts in Activity; per-agent AI spend on the agent page
- [ ] Self-serve top-up (USDG on chain) when ready

## Phase 2: Backtest in the Studio
- [x] 30-day backtest panel (same engine), equity chart, tokens with short history shown as "too new": built into the Studio in Phase 1

## Found during prototype / setup
- [ ] `npm audit`: 9 high warnings, all in build tools (glob, braces via OpenNext/ESLint); production deps report 0. Recheck on next OpenNext update
- [x] Git initialised (2026-10-15), first commit d945fbe, `.gitattributes` keeps LF, secrets scan clean
- [x] Code on GitHub (2026-10-15): private repo https://github.com/zolvaagent/zolva under a separate brand account. Every commit is authored as `Zolva <343081122+zolvaagent@users.noreply.github.com>` (repo-only git config, history rewritten before the first push, personal name/email scan clean). This folder uses the `gh` credential helper of the active `gh` account, so `zolvaagent` must be active to push
- [x] GeckoTerminal free tier rate-limits after ~10 quick calls: backfill is throttled (`REQUEST_SPACING_MS`), live prices come from chain

## Before public launch
- [x] GeckoTerminal commercial terms: solved by on-chain prices (2026-10-15); GeckoTerminal is only used for backfills and best effort repairs
- [x] Re-check price pool per token: done with the on-chain move (2026-10-15); recheck when a token is added
- [ ] Label off-hours (DEX-only) trades in the UI

## Phase 3: Real trading (confirmed goal, see mvp-plan section 8b)
- [x] Schema hooks (2026-10-15): `agents.mode` (paper|live, immutable via trigger), `agents.trading_wallet`, `executions` table (order lifecycle, tx hash, fills, gas; idempotent per agent/hour/token/side; delete-restricted), `trades.execution_id`. Checked structure by script; not yet run on a real Postgres (Docker was off)
- [ ] Keep MVP ready: engine decides, executor executes (paper executor now)
- [x] Research spike (2026-10-28, `docs/real-trading-spike.md`): custody = Privy signer with a policy on embedded wallets (eth_signTransaction, we broadcast); route = Uniswap SwapRouter02 exactInputSingle, v3 markets only (14 of 22); EquityRouter on chain does not match its source, not usable; gas about $0.01 to $0.06 a swap; testnet has no markets, test on mainnet with $5 to $10
- [x] Step 1a (2026-10-28): `npm run live:setup` created signer (key quorum) `sulnagv1p05c3j4s1dcfg0x0` and policy `ski28975qoskumany3xe0u0k` for the owner's embedded wallet `0x235c…f628`; Privy accepted the calldata rules. Key in .dev.vars only. Grant page `/dev/live-signer` (local only), test `npm run live:test` (dry run unless --send)
- [x] Step 1b (2026-10-28): signer granted; policy refused a USDG transfer (policy_violation); real $2 USDG to NVDA swap on mainnet, filled exactly at the quote, gas about $0.011 (results in docs/real-trading-spike.md)
- [x] Step 2 built (2026-10-28): executor core, live runner in the tick (newest hour only, recovery, sells first, auto pause after 2 failures), migration live_executor (kill switch OFF, $100 cap, $300/day, 1% slippage, 2% price check, allowlist, guard trigger, apply_live_fill), scripts live:agent and live:smoke, 6 unit tests (116 total)
- [x] live:smoke passed (2026-10-28): $2 NVDA buy at -0.02% and full sell at -0.11% vs the hourly close, about $0.016 gas
- [x] Privy signing verified inside the Worker (wrangler dev, sign only): approve signed, transfer refused, 469 ms
- [x] Live for the owner (2026-10-28): agent eda06900 "Live BTC ETH" (mean reversion, ETH + BTC, $10), deployed, kill switch ON; first live hour 10:00 UTC = hold on both
- [ ] Watch the first live trades: fill vs decision price, gas, DB cash/positions vs wallet balances, compared with the paper twin "Lab · Crypto Mean Reversion"
- [x] Agent page for live agents (2026-10-28): "Live · real money" badge (no more "Trade with real money · Soon" on live agents), Mode and Wallet rows with a Blockscout link, trades "real fills, gas included" with a Tx link each, and an "On-chain orders" card from executions (filled, sent, failed, not sent, with the reason). Sidebar says "Email or Google login" or "Wallet login" from a display-only zolva_login cookie set at login (older sessions show "Signed in")
- [ ] Small: "Next decision in N min" causes a hydration warning when the minute changes between server render and hydration (existing, harmless)
- [ ] Legal review of automated trading of tokenized securities for users (before any real money)
- [ ] On-chain executor via `equity-router` or Uniswap, Chainlink price check, max slippage, gas handling
- [ ] Invite-only live beta with per-agent caps and a global kill switch

## Later (only with real users)
- More strategies, alerts (LLM-written strategies shipped as prompt mode on 2026-10-16; the token is planned under Phase A)

## Dark mode (2026-10-27)

- [x] Dark theme tokens in `app/globals.css` (`:root[data-theme="dark"]`), plus theme role tokens (`--color-surface`, `--color-tint`, `--color-on-text`, glass, shadows) replacing about 60 hard-coded light colors; panels that are dark in both themes keep fixed colors
- [x] `ThemeToggle` (Light ↔ Dark, saved in localStorage; a first visit starts from the OS setting; "System" option removed 2026-10-27 at the user's request): sidebar row, mobile top bar, landing header; `THEME_INIT_SCRIPT` in `app/layout.tsx` sets the theme before paint; Privy's login window follows the theme
- [x] Checked in headless Edge: landing (full length), Markets, BTC page, Studio, Leaderboard, Activity, logged-out Dashboard at 1440 px; Markets and Studio at 390 px; light mode unchanged
- [x] Deployed 2026-10-27 and checked live: landing, Markets, Studio, Leaderboard in dark at 1440 px, Markets at 390 px, Studio in light; the toggle cycles System → Light → Dark and saves the choice
- [ ] Check logged-in views in dark (Dashboard with agents, agent page dialogs, Privy login window): not covered by the headless check

## Docs (2026-10-27)

- [x] Step 1: `/docs` with topic sidebar, "On this page" list and previous/next links (`lib/docs.ts` holds the page list; `components/site/Docs.tsx` the parts); pages Getting started, How agents work, Strategies, with every number taken from the engine and app; Docs links in the site header, footer and app sidebar; checked in light and dark, desktop and phone
- [x] Step 2: Prompt mode, Backtests, AI co-pilot (model table read from `lib/ai/models.ts`), Markets and prices, Leaderboard and publishing, Guardrails (incl. what pausing does), FAQ and glossary (with FAQ structured data); checked in light and dark, desktop and phone
- [x] Deployed docs and the Light/Dark toggle (2026-10-27): all 10 pages return 200, /docs redirects to Getting started, the toggle switches and saves
- [x] Docs pages have no marketing footer: moved to their own `app/(docs)` route group with the site header only (URLs unchanged)
- [x] Pause dialog already explained open positions; now leads with "Pausing does not sell anything" in red when positions are open, and no longer says "stocks"
- [x] AI co-pilot and strategy writer prompts now cover crypto (ETH, BTC); US market hours apply to stock tokens only
- [x] Tweet P9: the wrong "missed hours are skipped" line replaced with "Settings locked after launch" (missed hours are in fact replayed, up to 7 days)
- [x] Terms: agents are private until published (updated October 27, 2026; `LegalPage` takes an `updated` date)

