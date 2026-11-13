# Plan: MCP actions, perps leverage, paper to live (approved 2026-11-13)

**Approved by the owner on 2026-11-13**, including API keys first (OAuth later) and
`pause_live_agent` as the only real-money action over the API.

Three directions the owner asked for. Nothing here is built. Each phase has a gate; stop
when a gate fails. The rules in `CLAUDE.md` still hold: `runHour` is the only place
decisions are made, the AI may only veto, and tokens are picked by address, never by symbol.

**Short version**
1. **MCP and API actions:** yes, for **paper agents first**. Use per-user API keys with
   scopes. Real-money actions over the API are limited to **stop**. About 3 to 4 sessions, $0.
2. **10x leverage:** research it, but **10x will almost certainly fail the gate**. Arithmetic
   from today's results says 2x is the realistic ceiling. Lighter's own margin tables also rule
   10x out on several of our perps. About 1 session of research, $0.
3. **Paper to live:** a strict order, one feature at a time. Each feature needs fresh-hour paper
   results that beat holding. Most features will probably not pass. The first step is the
   owner's own end-to-end test of self-serve real money, which is already built.

---

## 1. MCP and public API with actions

### Where we are
- Read only today: `/mcp` (5 tools) and `/api/public/v1` (agents, markets, activity). No key,
  about 60 requests a minute per IP (`PUBLIC_API_LIMITER`), and the edge cache protects Supabase.
- Paid reads already exist without an account: x402 at `/api/x402/v1/scan` (0.02 USDG) and
  `/backtest` (0.03 USDG).
- Every write today goes through the logged-in web session (Privy cookie):
  - `POST /api/agents` creates an agent, paper or live.
  - `PATCH /api/agents/[id]` pauses or resumes, publishes, and sets the AI limit.
  - `/api/strategy/generate` runs the strategy writer.

### What others do
These come from `docs/integration-scan.md` and were not re-checked today.
- **Longbow MCP:** 31 tools including actions, no key needed. Our understanding is that its
  actions return plans or transactions for the user's own wallet to sign. Confirm this before
  we quote it.
- **Oak Agent Kit:** about 35 Robinhood Chain projects. Actions need a verified ERC-8004 agent
  ID. Zolva is agent #25650.
- **The difference for Zolva:** our agents and paper trades live off chain, in our database.
  So "actions" here means changing *the caller's own Zolva account*, not signing transactions.
  That needs real account auth. A wallet-signs-it model like Longbow's does not fit.

### Which actions (in risk order)

| Tier | Tool / endpoint | Notes |
|---|---|---|
| 0 (exists) | `list_agents`, `get_agent`, `list_markets`, `get_market`, `recent_activity` | Unchanged; still no key needed |
| 1. Compute, no state | `validate_rules`, `backtest` | `backtest` is free with a key (rate-limited) and stays x402-paid without one. Same `simulate` / `runHour` path as the Studio |
| 1. Compute, costs AI | `write_strategy` (prompt to rules) | Through `ai_generation_start` / `ai_generation_settle`, paid from the caller's `ai_credits`, with the tier's daily tries. Output must pass `parseRules` |
| 2. Own paper state | `my_agents` (includes private ones), `create_paper_agent`, `pause_agent`, `resume_agent`, `publish_agent`, `unpublish_agent`, `set_ai_limit` | `create_paper_agent` calls the same `createAgent` as the Studio: same validation, tier limits, venue checks and allowlist. No new strategy logic anywhere |
| 3. Own live agents | `pause_live_agent` only | Stopping is always safe. Resume, create and edit stay in the browser, where the Privy signer grant and the limits are shown |
| Never over the API | Live orders, manual swaps, withdrawals, creating live agents, changing caps | Any of these would turn Zolva into an execution API for other people's money. That is a legal risk and an attack surface |

**Two-step writes for AI clients.** `create_paper_agent` and `publish_agent` take
`confirm: false` by default. In that mode they return a preview: the backtest, a summary and
what will happen. Only a second call with `confirm: true` writes anything. This stops a model
from launching agents by accident.

Tools also carry MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

### Auth: compared

| Option | Fit | Verdict |
|---|---|---|
| **Per-user API key with scopes** | Created on the Dashboard while logged in; sent as `Authorization: Bearer zk_...`; works with Claude Code, Cursor, `mcp-remote` and curl | **Start here.** Simplest, standard, revocable |
| MCP OAuth 2.1 (Privy login inside the client) | The "Connect" flow Claude.ai custom connectors and directories prefer; no key to copy | **Phase B.** More work (authorization server, token storage, consent screen). Do it when a directory or the claude.ai connector needs it |
| Wallet signature per call (SIWE-style) | Good for proving a wallet, clumsy for an MCP client | Only for binding extra wallets, as today |
| x402 pay per action | Good for anonymous compute (backtest, scan); bad for state: the payer becomes the owner, and $0.03 does not stop spam agents | Keep for compute only. Optional later: x402 as an extra charge on heavy backtests |

**How keys work**
- Store only a hash: SHA-256 of a random 32-byte secret. Show the secret once.
- A key has a name, `created_at`, `last_used_at`, `revoked_at` and scopes:
  - `read:private`
  - `compute`
  - `ai`
  - `agents:write`
  - `live:stop`
- Default scopes: `read:private` plus `compute`. The others are opt-in checkboxes.
- At most 5 keys per account.
- The key never grants more than its owner's tier (same active-agent cap, same AI tries).

**Geo block.** An API call usually comes from a server, so the IP country means little.
- Check the country when the key is created (logged in, the same check as today).
- Store the account's country. Refuse write scopes to blocked countries.

### Rate limits and abuse
- One Workers rate-limit binding keyed by key id, separate from the per-IP limiter:
  - reads: 120 a minute
  - writes: 30 a minute
  - backtests: 60 an hour
- Hard daily caps checked in the database, since the Cloudflare limiter is approximate (see
  tasks.md 2026-11-04):
  - 20 agent creates a day per account
  - 200 backtests a day
- The active-agent cap already exists as a trigger.
- `Idempotency-Key` on creates, so a retry never makes two agents.
- A new `api_key_events` audit table: key, action, agent id, result, time. Visible to the
  owner on the Dashboard.
- **Prompt injection.** Published agent names and strategy prompts are other users' text, and
  an AI client will read them.
  - Return them in clearly labelled fields (`userText`).
  - Strip control characters and cap the length.
  - Say in the MCP instructions that these fields are user content, not instructions.
- Spam published agents: `publish_agent` needs at least 24 live paper hours. Published agents
  already show their record against holding.

### Phases

| Phase | What | Effort | Cost | Gate |
|---|---|---|---|---|
| A1 | Keys table + migration, Dashboard "API keys" card (create, scopes, revoke, last used), Bearer auth in `lib/public-api/http.ts` | 1 session | $0 | Key created, used, revoked in `wrangler dev` |
| A2 | Tier 1 + 2 tools on MCP and matching REST under `/api/public/v1/me/...`, two-step writes, audit log, per-key limits | 1.5 sessions | $0 (AI writer billed to the caller's credits) | SDK client test creates, pauses, publishes and unpublishes a paper agent; limits return 429; private agents of other users stay 404 |
| A3 | `pause_live_agent`, docs pages (`/docs/mcp`, `/docs/public-api`), MCP Registry version bump | 0.5 session | $0 | Owner pauses their live agent from Claude Code |
| B | OAuth 2.1 for MCP (Privy login, consent screen) | 2 sessions | $0 | Works as a claude.ai custom connector |

**Risks**
- Leaked keys: scopes, revocation and paper only make the damage small.
- More support load: "my agent did X".
- An AI client that loops creates: daily caps, idempotency and the two-step write.

**Owner decides**
1. API keys first, OAuth later. OK?
2. Is `pause_live_agent` the only real-money action over the API?

---

## 2. Perps leverage up to 10x

### What Lighter allows

Read today from the free public `orderBookDetails`. Margin fractions are in basis points.

| Perp | Max leverage | Maintenance margin | Price move to liquidation at 10x (isolated, approx.) |
|---|---|---|---|
| BTC, ETH | 50x | 1.2% | about 8.8% |
| SOL | 25x | 2.4% | about 7.6% |
| HYPE, XRP | 20x | 3% | about 7% |
| ZEC, NEAR | **10x** | 6% | **about 4%**, which is inside our 5% stop |
| LIT | **5x** | 12% | 10x is not allowed |
| NVDA and stock perps | 20x | 3% | (stock perps already failed research) |

- Liquidation fee: 1%. Default leverage: 2x.
- So 10x is not even allowed on LIT. On ZEC and NEAR, liquidation would hit before the stop
  loss on any normal dip.

### Why 10x will almost certainly fail

Today's 1x results (perps-research.md), and what scaling them up implies:
- **Deep Dip on BTC, ETH and SOL** had a worst drop of 6.6%. Even scaled linearly, that is
  about 13% at 2x, about 20% at 3x, about 33% at 5x and about 66% at 10x. Compounding and
  intra-hour wicks make it worse.
- **Each 5% stop at 10x costs about 50% of the position's margin.** Deep Dip buys crashes,
  exactly when hourly lows wick far below the close. At 10x on BTC, the liquidation line is
  about 8.8% below entry. A dip-buy entry that keeps falling for one more hour hits it.
- **Funding scales with notional.** At about 5% a year it costs about 50% a year of the
  margin at 10x for longs. That is small per hour, but it eats every slow trade.
- **Alts and Spike Fade at 1x** had drops of 9.1% and 20.7%. Spike Fade at 2x is already
  past any sensible gate.

**Honest expectation**
- 2x on BTC and ETH Deep Dip may pass.
- 3x is borderline.
- 5x and 10x fail.

The research run will measure this rather than assume it, but nobody should plan UI or tweets
around 10x.

### Research gate (Phase L0, read only)
- Script: extend `scripts/research-perps-engine-check.mts`. It reads only cached Lighter
  history, no paid calls.
- Strategies: Deep Dip (BTC ETH SOL), Deep Dip Alts, Spike Fade and Bounce Short, at
  1x, 2x, 3x, 5x and 10x.
- Model:
  - Isolated margin per market.
  - Notional = margin x leverage.
  - Funding on notional.
  - 0.05% cost on notional per fill.
  - **Liquidation from the hourly high and low:** a long is liquidated if the hour's low
    breaches `entry x (1 - 1/L + mmf)`; a short mirrors this with the high. The margin is lost
    plus the 1% fee.
  - The stop is still checked on the close, as today. Leverage is capped at the market's
    max (LIT 5x).
- Windows:
  - The same windows as the 1x tables.
  - **Fresh hours after 2026-11-07 as the held-out test.** The old held-out month has
    already been used.
- **Pass, per leverage level:**
  - positive in every window
  - beats holding the same markets in the fresh hours
  - worst drop at most 15%
  - zero liquidations in the backtest
  - at least 30 round trips
- If nothing passes above 1x, the "Later: leverage" task closes as "no".

### If a level passes (Phases L1 to L3)

| Phase | What | Effort | Gate |
|---|---|---|---|
| L1 | Engine: `leverage` option in `runHour` (margin, notional, funding on notional, liquidation from high and low, liquidation fee); the **same change in `prototype/engine.js`** with the parity test extended; behaviour tests (liquidation, funding, cap per market); migration: `agents.params.leverage` with a check of at most the passing level and at most the market max; `agents_venue_guard`: leverage only on perps, never on live | 2 sessions | `npm test` incl. parity; engine check reproduces the research numbers |
| L2 | Lab agents at the passing level, beside their 1x twins; UI: leverage on agent pages, leaderboard and API; Studio leverage picker only if L3 passes | 1 session + 3 to 4 weeks of paper hours | Leveraged twin beats its 1x twin **and** holding on fresh hours, no liquidation |
| L3 | Studio option (paper only) with risk copy: "2x leverage doubles gains and losses. A drop of about X% in one hour closes the position and loses its margin." Shown before launch, with an "I understand" checkbox | 1 session | Owner reviews the copy |
| L4 | Real money with leverage: owner only, after perps live at 1x has run 2+ weeks (section 3, step P) | later | Owner approval for each step |

**Region and terms**
- Lighter: the press lists the US, UK, Canada, Switzerland, UAE and Singapore as excluded. The
  docs give no list. **The owner must read Lighter's terms** (open task) before any real money
  on perps.
- **Singapore is not in `LIVE_BLOCKED_COUNTRIES` today.** Add it before perps go live.
- Offering leverage to *users* is a derivatives offering. Many regulators limit retail crypto
  leverage hard. EU/ESMA-style rules cap retail crypto CFDs around 2x. The UK bans crypto
  derivatives for retail. So **10x for users is very unlikely to be offerable**, whatever the
  backtest says. User leverage needs the legal review first; owner-only is the honest scope.

---

## 3. Paper features that can go live

### Inventory

| Feature | Paper state | Live state | Blockers |
|---|---|---|---|
| Spot momentum / mean reversion / custom, v3 markets | Running | Owner only (Live BTC ETH; Live CRCL RDDT GME paused). Real money so far: **$19.46 of $20** | Record loses to holding in most windows |
| **Self-serve real money** (Studio LiveSetup, `/api/live/setup`) | n/a | **Built, not deployed, untested logged in** | Owner end-to-end test; Terms real-money section needs a legal read; Privy allowed origins; one wallet per agent question (mvp-plan 8b) |
| Crypto (ETH, BTC spot) | Running | Live for the owner already | Same as spot |
| AI co-pilot | Running; twin test "Twin · RSI Dip" vs "+ AI" since 2026-11-11 | Refused on live (`create.ts`) | Twin result; a defined behaviour when the model fails (rules alone, never "AI decides") |
| Dip Hunter (spot, 14 markets) | Lab agent since ~2026-11-03 | Not offered | Review was due ~2026-11-17; the 14 markets happen to be the 14 v3 ones |
| v4 markets (AMC, BABA, META, MSTR, PLTR, SPY, TSLA, TSM) | Running | Not allowed | The Universal Router calldata cannot be checked by a Privy policy |
| Perps 1x (Deep Dip, Alts) | Lab agents | Never live (`agents_venue_guard`) | Fresh-hours re-test ~2026-11-28; Lighter terms; new custody (sub-account + API key outside Privy's policy); executor adapter |
| Shorts (Spike Fade, Bounce Short, perps only) | Lab agents; reviews ~11-20 and ~11-24 | Never live | After perps 1x is live |
| Leverage | Not built | n/a | Section 2 |
| Stock perps, scalping, swing | Failed research | n/a | Not going live |

### Gate for every step ("fresh-hour gate")

Before any real money, every feature must pass all of these:
- **At least 3 weeks of paper hours after the rule was frozen.** Backtest windows don't count.
- **Return above holding the same markets** over those hours, and above 0.
- **Worst drop at most 10%**, or at most 15% for perps with leverage.
- **At least 20 round trips**, or 6 weeks for rare-signal rules.
- **Paper within about 2 points of the engine check** on the same hours, so the live system
  does what the backtest says.

Then it runs owner only, at most $20 to $50, for at least 2 weeks, before any user sees it.

### Order

| Step | What | Gate before | Effort | Cost to owner |
|---|---|---|---|---|
| S | **Owner tests self-serve spot** on production with $5: grant signer, fund, launch, first fill, Stop, revoke. Keep it behind the wallet allowlist (`live_wallets`) until the legal read | None, the code exists | 0.5 session + owner time | $5 at risk, cents of gas |
| D | Dip Hunter live, owner only (14 v3 markets, $20) | Fresh-hour gate on Lab · Dip Hunter (review now overdue) | 0.5 session (allow the preset in live, guard test) | $20 at risk |
| C | AI co-pilot on live agents (veto only; when the AI fails, the rules run; never sizes trades or skips stops) | Twin + AI beats Twin on fresh hours over 3 to 4 weeks (~2026-12-09) | 1 session (allow it in `create.ts`, the live runner passes `veto`, the AI limit still enforced by `ai_claim_review`) | AI cents per review |
| P | Perps 1x live, owner only: Deep Dip on BTC ETH SOL, one Lighter sub-account, a trade-only API key as a Worker secret, executor adapter, fills checked against Lighter every hour, auto pause, kill switch | 11-28 re-test passes + fresh-hour gate + **owner read Lighter's terms and region** | 3 sessions | $20 to $50 deposit |
| X | Shorts on perps live (Spike Fade / Bounce Short) | Each passes its own fresh-hour gate; step P ran 2 weeks clean | 0.5 session each | Within P's deposit |
| V | v4 markets live | Only if a v4 rule passes the gate; needs a policy-safe route (UniversalRouter pinned + amount limits, or a small audited router) | 2+ sessions | audit cost if a contract |
| Lev | Leverage, owner only | Section 2 | see above | |
| U | Open real money to users (any of the above) | Legal review done; at least one strategy beat holding live for the owner; one wallet per agent decided; Privy origins; geo list confirmed | 1 to 2 sessions | lawyer fees |

**Honest note.** The strongest evidence so far is the 1x Deep Dip on crypto perps, and even
that is a small sample with about 2 trades a week. Spot strategies mostly lose to holding.
Expect several of these steps to stop at their gate. That is the plan working, not failing.

### Legal and region blockers
- **No legal review yet** (owner's choice, 2026-10-28). It is fine for the owner's own wallet,
  and a blocker for step U.
- Spot live block list: US, CU, IR, KP, SY, GB, CA, CH, AE. **Add SG for perps.** The owner's
  own country must be allowed by Lighter's terms.
- Robinhood's stock token terms (no US persons) apply to spot.
- Perps funds leave the Privy policy. A leaked Lighter key can lose money through trades, but
  cannot withdraw to a stranger. Keep each sub-account's deposit small.

---

## What the owner must do

1. Approve or change this plan, and answer the two API questions in section 1.
2. Read Lighter's terms of use and confirm your country is allowed (before steps P and Lev).
3. Run the self-serve real money test (step S) with $5, logged in on production.
4. Add the Privy allowed origins (open task).
5. Decide when to do the legal review (blocks step U and any user leverage).

## Suggested order of work
1. **Now, free:** leverage research L0 (1 session, read only). A1 + A2 API keys and paper
   actions (2.5 sessions). Owner step S.
2. **Late Nov:** the 11-28 perps re-test. The Dip Hunter, Spike Fade and Bounce Short reviews.
   Decide steps D and P.
3. **December:** the co-pilot twin decision (step C). Perps live owner only (step P), if it
   passed.
4. **Later:** shorts live, OAuth, leverage paper (only if L0 passed), users (after the legal
   review).
