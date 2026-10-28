# Tasks

See [mvp-plan.md](mvp-plan.md) for scope and decisions.

## Open now (cleaned up 2026-10-28)

Everything still open, in priority order. Details are in the sections below.

**Before announcing wider**
- [ ] Privy allowed origins: add https://zolvaagent.app and https://www.zolvaagent.app (owner, Privy dashboard), plus http://localhost:3000 for local dev
- [ ] Workers observability/logs on (`observability.enabled` in wrangler.jsonc)
- [ ] Newsletter form: connect an email provider or remove the form
- [ ] Confirm the excluded-countries list (US + likely UK, CA, CH, AE) and the geo-block
- [ ] Check Privy pricing for monthly active users
- [ ] Check logged-in views in dark mode (owner, needs a login)
- [ ] Manual check of the AMC token (its old pool was against a spam-looking token)
- [ ] Make the GitHub repo public, create the X account and set its link in `lib/social.ts` (owner)

**Product**
- [ ] Lab review around Nov 1 to 12: which strategy beats holding per basket; decide the presets
- [ ] 9 more coins (SOL, BNB, HYPE, XRP, TRX, ZEC, DOGE, NEAR, XMR) from Chainlink on Arbitrum (TRX on BNB Chain): waiting for Arbitrum and BNB Chain to be enabled on the Alchemy app
- [ ] Self-serve AI credit top-up (USDG on chain); paid models are unusable without it
- [ ] Agent page: show the strategy prompt and per-agent AI spend; Activity: show AI verdicts
- [ ] Docs: Contracts page (token, pool and feed addresses from the `tokens` table)
- [ ] Markets: hide the "US market open/closed" line on the Crypto tab; label off-hours (DEX only) prices

**Token and launchpad**
- [ ] Zolva token on Pons: ticker, then CA, Dex link and burn tx in the drafts, and the launch video
- [ ] Launchpad contracts with Foundry tests (needs OK to install Foundry), then an audit

**Real money trading** (Phase 3 below)
- [ ] Custody model, executor, invite-only beta with caps and a kill switch
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
- [x] Clickable prototype with real prices: `prototype/` (landing, Forge + backtest, agent page, leaderboard, legal, 404). Preview: `pitwise-prototype` in `D:\Claude\.claude\launch.json`
- [x] Fixed price pools: each token now priced from its deepest **USDG** pool (first pick included stock/stock pairs)
- [x] Tuned strategy thresholds on real data (see mvp-plan section 4)
- [x] Go / no-go decision on the prototype: **Go** (2026-10-15)
- [x] Prototype live for design review: https://pitwise-prototype.hoodguard.workers.dev (separate Worker, redeploy with `npm run deploy:prototype`)
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
- [x] Verify 20 token addresses against Robinhood's official Stock Token list (2026-10-15): all 20 match active assets in `GET https://api.robinhood.com/rhj/assets` (194 tokens on chain 4663). `tokens.verified_official` set (migration `verify_official_tokens`); market pages show a verified note. Tokens carry a small `currentMultiplier` (ERC-8056 corporate actions, up to 1.0027), so a token price can sit slightly above the share price
- [ ] Confirm excluded-countries list (US + likely UK, CA, CH, AE)

## Phase 1: Paper-trading MVP
- [x] 1.1a App setup: Next 16.4 + Tailwind 4 + OpenNext Cloudflare, Loopa-style env + Supabase client, `/api/health`, design tokens from prototype. Lint, type check, `next build` and OpenNext build all pass
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
- [x] 1.6 Deployed to https://pitwise.hoodguard.workers.dev (2026-10-15, version 6f16ef52). Live checks: all pages 200, health ok, cron tick refuses no-secret calls, wallet login E2E pass on production (test wallet removed), Privy active (forged token 401), pg_cron `sita-hourly-tick` active at minute 7, Cloudflare cron at minute 5
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

- [x] Workers request isolation (2026-10-16): `db()` no longer caches a module-level Supabase client. Each route and page creates one client per request and passes it to the `lib/` functions, which now take it as their first argument. A shared client let overlapping requests (the cron tick and a page view, or pg_cron and the Worker cron) resolve each other's promises, which Workers cancel. Same fix as Obelisk. viem: the chain client uses no JSON-RPC batching, so its shared URL-keyed batch queue does not apply. Verified in `wrangler dev --test-scheduled`: two Worker crons, a direct `/api/cron/tick` and 8 pages/APIs at once, all 200, all three ticks `ok`, no cross-request warnings

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
- [ ] Make the GitHub repo public (owner does this; the footer link 404s for visitors until then)
- [x] X profile kit (2026-10-16): handles, bios, fields, slogans and wording rules in docs/x/profile.md; banner assets/x/x-profile-header-1500x500.png (rendered free from banner.html); 3 tweet drafts in docs/x/tweets.md
- [x] X content plan (2026-10-16): 3 narrative quote tweets, 2 teasers, launch post with token, Dex paid, dev supply burnt, 10 product posts (docs/x/tweets.md, all under 280), posting calendar (calendar.md), launch video plan with options (video-plan.md). No assets generated yet
- [ ] Token: decide ticker, launch on Pons (check whitelist), then fill CA, Dex link and burn tx in the drafts
- [x] Launch video option B: 2 Grok clips generated (2026-10-16, about $0.91), files in video/clips
- [ ] Launch video edit: screen recordings + the 2 clips + captions + end card (needs ticker and CA)
- [ ] Create the Zolva X account, then set its href in lib/social.ts (the footer already shows the X icon as coming soon)
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
- [ ] Step 1: prove the signing path with one tiny real swap (owner enables Privy signers, funds the embedded wallet with ~$10 USDG + ~$1 ETH)
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

