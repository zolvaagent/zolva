# Zolva × Rushr integration: plan (draft for owner approval, 2026-11-17)

Owner: "we need to integration zolva and rushr. so we will able to create agent and integrate with rushr and use their machine. i think this is big."

Status: plan only. No code, no wallet, no registration, no funds. Sources: Rushr agent docs in `rushr-dev/platform` (`apps/docs/.../agents/api/*`: register, trade, social, leaderboard, errors-and-limits; `leaderboard.md`, `faq.md`, `talos.md`), the working Lab agent (`zolva-lab-agent`: `src/executor.ts` `checkBuild`, `scripts/register-rushr.ts`, `scripts/policy.ts`, `src/callouts.ts`), Zolva's live stack (`lib/live/onboard.ts`, `runner.ts`), and the Rushr/Lab notes (`rushr-plan.md`, `rushr-lab-agent-plan.md`, `rushr-lab-agent-design.md`, `memecoin-research.md`).

## 1. What Rushr's machine actually is

| Piece | What it gives | Limits that matter to us |
|---|---|---|
| Registration (SIWE) | A member with an "Agent" badge, handle, bio; API key `rk_…` (read, profile, post, trade) | One wallet = one member, **no unregister**. EOA signature only. 5 successful sign-ups per day **per IP**, nonces 20/h per IP. `owner: null` today: linking to an owner is "planned" |
| Quote / build | Unsigned tx for graduated tokens (Universal Router, ETH or USDG) and PONS curve tokens (ETH only), dry-run simulation | 0.25% fee (0.5% after beta). Curve fee is a 2nd tx; unpaid after 10 min → every build 402. 20 quotes, 10 builds per minute per key |
| Safety | Risk level, honeypot buy-then-sell check on every buy, price impact guard | `safety_unverified` must never be treated as a pass |
| Social | Callouts (bullish/bearish, linked to our real buy as `entry`, tracked result), comments, follows | 10 calls/h, 30/day; comments 30/h; no links |
| Leaderboard | USD PnL from **any** indexed swap of the wallet, humans and agents together, 24h/7d/30d/season | Counts only "tracked" tokens: WETH, USDG, NVDA, SPCX, TTWO are quote tokens (trades between them never count); older tokens count after hydration. Wash rule: counterparty wallet "linked by funding" is not counted |
| Market data | Trenches lists (`new`, `almost`, `migrated`), stats, safety, feed | Public routes unauthenticated; keyed 60 GET/min |

What it is **not**: no paper trading, no history API for backtests, memecoin-first. Rushr runs nothing; the operator runs and signs.

The Lab agent already proves the full loop works: SIWE register from a Privy server wallet, `POST /v1/trade/build` → `checkBuild` → Privy sign → curve fee follow-up → fee report → callout after buy, comment per sell.

## 2. Two very different things hide inside "integrate"

- **A. Rushr as a scoreboard and social layer for Zolva's existing live agents** (stocks, cbBTC, ETH; hourly `runHour`; our own SwapRouter02 executor). Small, fits every current rule.
- **B. Zolva agents that trade Rushr's markets with Rushr's machine** (memecoins on PONS curves and graduated pools; every minute; Rushr builds). This is the "big" one. It breaks three house rules (hourly `runHour` only, address allowlist, backtest before launch) and puts user money into the riskiest market on the chain.

**DECIDED 2026-11-17** (owner: "langsung B dan tidak perlu invite only, dan tidak mungkin paper only sebenarnya. langsung siapkan agar ready to realase dengan risiko masing-masing"): build **B straight away, open to all eligible users, real money, each user at their own risk**. No invite list, no paper product (Rushr is real money only). A becomes a small add-on later. The release plan is section 4; the safeguards that replace the invite list are in 4.1.

## 3. Decisions with tradeoffs

### 3.1 Which agents qualify

| Option | For | Against |
|---|---|---|
| Paper agents | Most users have them | Rushr is real money only. A paper agent on Rushr would have a profile with no trades, and callouts with no `entry` would mislead. **No.** |
| Live stock/crypto agents (A) | Real wallet, real swaps, already built | Many trades are invisible: WETH and NVDA never count, USDG↔WETH never counts, stocks like CRCL/RDDT/GME need hydration (state unknown). Low or empty rank is likely |
| Live memecoin ("trench") agents (B) | Exactly Rushr's market; every trade counts; their builder and safety fit | New market for Zolva, no backtest data, Research's step 0 was NO-GO (~6% round-trip cost, graduated tokens −47% median) |

Decided: **B, live, open** (section 2). Paper agents are never registered. Dry run exists only as an internal test mode (CI, smoke test before a preset ships), not as a product. A (existing live agents on Rushr) later, as a small add-on.

### 3.2 Where the agent runs, and the `runHour`/Verify rules

- **A:** no change. The hourly tick, `runHour`, the executor and Verify stay as they are. Rushr only reads the chain. Optional: post a callout after a live buy (from the tick, after the swap is indexed, ~3 min later: a follow-up step in the next minute's cron or a queued job).
- **B options:**

| Option | For | Against |
|---|---|---|
| B1. Extend `runHour` to minutes | Keeps "one decision engine" literally | Huge change to the engine and its prototype parity test; memecoin rules (curve %, dev wallet, X checks) have nothing in common with candle strategies |
| B2. **A second engine, `lib/trench/`, with its own single decision function** (`runMinute`), used by both live and dry run, with its own parity test against `zolva-lab-agent` | Same principle as `runHour` (one place decides, live and dry run share it), clean | Needs the owner to amend the CLAUDE.md rule; strategy code becomes public in the public repo (Lab repo is private on purpose) |
| B3. Keep it outside the app: a "Zolva agent runner" service (the Lab agent generalised, multi-tenant) that the app configures | Strategy stays private; per-minute Node is easy | User funds' signing then lives on a second system (today a shared VPS): worse custody and ops |

Where it executes: a **separate Cloudflare Worker with a one-minute cron** (same Supabase, same Privy signer secrets as the app), one shared Rushr scan per minute for all agents, per-agent work fanned out (Queues) when there are many. Not the shared VPS: it must not hold the signer for users' wallets. The VPS Lab agent stays as the reference implementation, like `prototype/engine.js`.

**The VPS question** (owner, 2026-11-17: "bagaimana urusan vps nya"):
- The shared VPS stays for the **Lab agent only** (@zolva_lab, the owner's own $100, its own wallet). It is the testbed where new preset rules run first.
- **User agents do not run on the VPS.** It is shared with other apps, has one operator, no failover, and would have to hold Zolva's Privy authorization key, which can sign for every user's agent wallet. A leak there reaches every user. On Workers the key stays where it already is (Worker secrets), next to the hourly live runner.
- Workers fit: Zolva is already on Workers Paid (cron down to one minute, 30 s CPU per run by default, raisable), the loop is mostly waiting on Rushr, Privy and RPC calls, and it costs about nothing extra at beta size. If the minute loop gets heavy (many agents), fan out with Cloudflare Queues; one Durable Object per agent is the next step if per-agent state needs it.
- When a VPS would be right instead: a need Workers can't meet (e.g. a websocket or mempool listener for sub-minute speed). Then a **dedicated** VPS for Zolva only (not the shared one), the signer key in a secret manager, monitoring and alerts, a second machine or a quick restore. That is more ops work for the owner; not needed for minute-level presets.

Recommendation: **B2 in a separate Worker**, if the owner accepts publishing the preset rules (they are already described in public callouts). If not, B2's engine lives in a private package deployed into that Worker.

Verify: A is unchanged. B gets the same "check it on chain" story (every trade is on Blockscout) plus Rushr's independent board. Dry-run trench agents are labelled hypothetical, like paper.

### 3.3 Wallet and key custody per user

Today's live flow (`lib/live/onboard.ts`): the user's own Privy embedded wallet, Zolva's signer added by the user, limited by a per-wallet Privy policy (router + allowlisted tokens, paid back to the same wallet).

| Option | For | Against |
|---|---|---|
| Reuse the user's main embedded wallet | No new wallet | One wallet = one Rushr member forever; mixes manual swaps and agents; one compromised policy reaches all funds |
| **A dedicated embedded wallet per Rushr agent** (Privy "additional" HD wallet, user-owned, Zolva signer with a per-agent policy) | Maps 1:1 to a Rushr member; loss capped to what the user funds; clean public record | Needs a check that Privy allows several embedded wallets per user with separate signer policies (open question already in `mvp-plan.md`); each wallet needs its own ETH for gas |
| Zolva-owned server wallets per user | Simplest signing | Zolva holds user money: custody, legal, brand. **No** |

Policy per agent wallet, modelled on `zolva-lab-agent/scripts/policy.ts`: for A, today's live policy; for B, curve buy/sell to this wallet only, Universal Router and Permit2, token approvals with no ETH, Rushr fee transfer to its treasury Safe with a tiny cap, a value cap per tx, withdrawals only to the user's main wallet. `checkBuild` (every field of Rushr's build checked) runs before every signature; the Privy policy is the second line.

Recommendation: dedicated user-owned wallet per agent; **no `personal_sign` rule for Zolva's signer** (the user signs SIWE themselves, see 3.4).

### 3.4 Registration, handle and bio (Studio UI)

Flow: on a live agent (or a new trench agent) → "Put this agent on Rushr" → handle (3-20, a-z 0-9 _; live availability check via `/v1/handles/<h>`), display name (≤40), bio (≤160, prefilled "Runs on Zolva (zolvaagent.app). Run by @<user's X or Zolva name>. Not advice.") → a clear permanent-action warning (no unregister, public PnL tied to this address) → the **user signs Rushr's SIWE message in the browser** with that wallet (Privy shows it) → Zolva's server checks the message (prefix, address, domain, chain 4663), calls `POST /v1/agents/register`, stores `rk_` encrypted (`lib/secrets.ts` pattern), never shows it.

Tradeoffs:
- Server registers → hits Rushr's **5 sign-ups per day per IP** (Cloudflare egress IPs, shared). Browser registers directly → the key passes through the browser (it is the user's own key, acceptable) but depends on Rushr's CORS. Recommendation: server-side, ask the Rushr dev for a platform allowance; browser-direct as fallback.
- Key rotation or loss needs another user signature (`purpose=login`), so a lost key never needs a server-side signing rule.
- Handles: refuse `zolva*` handles for users (impersonation of our brand), reserve the pattern `zolva_` for house and Lab agents.
- `referralCode`: registering with Zolva's code gives users 10% off Rushr's fee. If Zolva earns from it, it must be disclosed. Owner decision.

### 3.5 Mirroring trades and callouts

- **Rushr → Zolva:** agent page shows a Rushr badge, rank and PnL from `GET /v1/members/<handle>/rank` (cached hourly), a link to the Rushr profile, and a note that Rushr's PnL differs from ours (windows, tracked tokens only, capped unrealised). Our ledger stays the source of truth.
- **Zolva → Rushr:** opt-in callouts. One bullish call after a buy (facts of the rule, "not advice", no links, posted ~3 min after the swap so `entry` links), a comment on that call for every sell, losses included (the Lab's `callouts.ts` texts). Default off for A, on for B. Respect 10 calls/h, 30/day.
- AI: the co-pilot may only veto (house rule). An LLM narrative check in B is a veto filter, billed through `ai_claim_review`/`ai_settle` and `ai_credits` like today. Callout text is templated, not model-written.

### 3.6 What a user can configure in B (no code): several presets now, custom rules later

Owner (2026-11-17): "harusnya ada presets beberapa dan bisa custom nantinya."

Design it as **one rule format from day one**: every preset is a saved set of rules in the same format a custom agent will use later, so custom is "edit a preset", not a second system. The format is a fixed vocabulary, checked by a parser like the Studio's `parseRules`:
- **Entry filters** on fields Rushr gives us: column (`new`, `almost`, `migrated`), age, bonding %, tax, dev %, fresh wallets %, traders, buy/sell ratio, pullback from high, liquidity, holders, Rushr risk level, DEX paid, CA posted by its own X, narrative check (AI veto only).
- **Exits** from a fixed set: stop loss, take-profit ladder, trailing stop, sell near graduation, time stop, invalidation (dev or top holder sells, buy/sell drops, safety blocked).
- **Sizing and limits:** budget, first buy, one add, max per token, max tokens, daily stop, total stop.
- **Guards no preset or custom rule can turn off:** a stop loss, Rushr's safety checks (never `acceptRisk`/`acceptImpact`), the slippage cap, the per-agent value cap in the Privy policy, the global kill switch.

Starting presets (Research writes the rules; a preset ships only after it has run live with house money, like Almost Bonded on @zolva_lab):

| Preset | Idea | Status |
|---|---|---|
| **Almost Bonded** | Lab rule v3: curve 35-70%, tight holder and attention filters, minute exits, sell near graduation | Live in the Lab now (@zolva_lab); first preset |
| **Graduated Safe** | Talos-like: graduated tokens only, ≥100 holders, ≥$2K 24h volume, risk low/medium, small size, short hold | New: Research to define and dry-run |
| **Fresh Launch Small** | Very early curve tokens (`new`), tiny size, fast stop and time exit | Riskiest; only if Research finds an edge, otherwise dropped |

User picks a preset and sets only budget, sizes, max tokens, daily and total stop, callouts on/off.

**Custom later (Phase 3):** the user edits a preset's thresholds or adds and removes filters and exits from the same vocabulary, or describes a strategy in words and the Studio strategy writer turns it into rules that pass the parser (same as today's `/api/strategy/generate`). The guards above stay locked. There is no history to backtest memecoins on, so a custom agent shows a stronger risk warning and starts at the smallest cap. Its Rushr bio says "custom rules" so its record is not read as a Zolva preset.

### 3.7 Fees and who pays

| Cost | Who pays | Note |
|---|---|---|
| Rushr 0.25% (0.5% after beta) | The agent's wallet (user) | Only on Rushr builds. A keeps our own router: no Rushr fee |
| PONS tax + curve fee | User | ~6% round trip on curve tokens (Lab design); the biggest cost by far, shown in the Studio before launch |
| Gas | User | Cents a trade; each agent wallet needs its own ETH |
| LLM narrative checks | User's `ai_credits` | Cents a day |
| Workers, Privy signatures, X reads | Zolva | Privy's per-signature/wallet pricing and X API cost at scale to confirm |
| Zolva fee | None in the MVP | Revisit once there is a record; a performance fee would push it further toward "managing money" (legal) |

### 3.8 Risks

- **Permanent:** registration can't be undone; a user's address is tied to a public PnL forever (beta resets aside).
- **User funds:** memecoin agents will likely lose; Research's step 0 was NO-GO and rule v3 is untested at scale. Open release at the user's own risk (owner's decision), so the safeguards in 4.1 are not optional.
- **Legal:** Zolva running real-money bots for other people in memecoins is closer to portfolio management than paper stock agents. The lawyer review in `mvp-plan.md` ("Before any real money") applies before B opens to users. Rushr's terms: not for US persons or OFAC countries; the operator is responsible for the agent's trades and posts; draft terms. Who is "the operator" (user or Zolva) must be clear in our terms.
- **Brand:** Zolva is "tokenized US stocks"; memecoins and $RUSHR next to $ZOLVA blur it. Keep it a listing and a tool, not a partnership; never tie $ZOLVA to $RUSHR; Lab framing for B.
- **Vendor dependence:** Rushr is beta (fee change, resets, API changes, downtime). Builds must fail closed (no trade) and exits must still be possible (sells are never blocked by Rushr; fallback: build curve/Router sells ourselves, as the Lab's ABI work allows).
- **Trusting their builds:** `checkBuild` on every field, Privy policy as second line, simulation required.
- **Rate limits:** per key fine (10 builds/min); sign-ups per IP and public reads from shared Cloudflare IPs are the real limits; one shared scan per minute.
- **Wash rule:** if Zolva ever funds agent wallets, or a user's agents fund each other and trade the same pool, Rushr may not count the trades. Users fund their own agent wallets; Zolva never sends funds.
- **Security:** more wallets with Zolva's signer = more value behind one authorization key. Per-agent value caps in the policy.

## 4. Release plan (owner: open to all, real money, "target nanti malam ready")

### 4.0 What can honestly be ready tonight (2026-11-17), and what cannot

The full B (users create live trench agents) touches user money in seven new places: an engine port, a one-minute Worker, a wallet per agent with a Privy policy, SIWE registration, a Rushr build executor with fee follow-ups, Studio screens, and migrations. Each needs tests and a run with house money. That is **about 2 to 3 weeks**, not one evening. Shipping it tonight would mean user funds behind untested signing code; I recommend against it.

**Tonight (release 0, "Zolva Trenches" goes public):**
- A public `/trenches` page in the app: the Almost Bonded preset explained (rules, exits, costs ~6% round trip), and the live record of @zolva_lab read from Rushr's public API (rank, PnL, trades, callouts) and from its wallet on Blockscout. Labelled "Zolva Lab experiment, real money, not advice".
- A "Create your trench agent" button that opens a notify list (email or wallet), shown as "opening soon".
- No user wallets, no registration, no signing, no new secrets. One small page plus one read-only fetch, cached.
- Needs: owner's yes to the page copy, then the normal deploy (`npm run deploy:prod`, owner's yes).

**Release 1 (user trench agents, ~2 to 3 weeks), work packages:**

| # | Work | Notes |
|---|---|---|
| 1 | Migrations: trench agents (preset, rules json, caps), positions, decisions, trades/executions, `rushr_accounts` (encrypted key), RLS | Reuse `agents` with a new market kind if it fits |
| 2 | `lib/trench/`: rule format + parser, `runMinute`, exits, limits; parity test against `zolva-lab-agent` | Needs decisions 2 and 3 |
| 3 | Worker `pitwise-trench`: one-minute cron, one shared Rushr scan, per-agent fan-out (Queues), idempotent per agent and minute | Decided: Workers |
| 4 | Executor: Rushr build → `checkBuild` → Privy sign → receipt → curve fee follow-up → fee report; pending-tx recovery; `fee_unpaid` handling; fallback sells if Rushr is down | Port of the Lab executor |
| 5 | Wallets: a dedicated Privy embedded wallet per agent, Zolva signer + per-agent policy, funding screen, "withdraw to my wallet" | Privy check first (Phase 0 item) |
| 6 | Rushr registration in the Studio: handle/bio form, user signs SIWE in the browser, server registers, key stored encrypted | Blocked by Rushr's 5 sign-ups per day per IP unless the dev gives an allowance or CORS allows browser-direct |
| 7 | Studio + agent page: preset picker, caps, risk screen, Rushr badge and rank, callouts toggle, decision log, pause, withdraw | |
| 8 | Safeguards (4.1) and alerts | |
| 9 | Terms update, US/OFAC geoblock check, risk acknowledgement stored per agent | Lawyer review: owner decision 6 |
| 10 | Release test: one house trench agent with small house money through the full app flow for 48 h, then open | Owner's yes for the wallet and funds |

### 4.1 Safeguards that replace the invite list
"Each user at their own risk" still needs these, because Zolva's signer is behind every agent wallet:
- **Per-agent cap** at start (proposal $100 deposited; buys refused above it), **global cap** on total value in all trench wallets, and a **global kill switch** (stops buys; exits keep running).
- Locked guards per 3.6 (stop loss, Rushr safety, slippage cap, Privy policy value cap).
- A risk screen the user must accept per agent: real money, memecoins, likely loss, ~6% round-trip cost, permanent public Rushr profile, not advice, not for US persons. Stored with a timestamp.
- Geoblock (already in the app) and Rushr's own exclusions.
- Alerts to the owner: failed trades, unpaid Rushr fees, stops that did not fire, Rushr down.
- Preset limit at release: **Almost Bonded only** (the one run live with house money). Graduated Safe after its own house-money run.

### 4.2 Before release 1 (Phase 0 items)
1. Owner asks the Rushr dev: sign-up allowance per IP for a platform, CORS for `/v1/agents/register`, owner linking / "runs on Zolva", partner terms (operator responsibility, many agents from one platform), referral terms, read limits.
2. Development checks Privy: several embedded wallets per user with separate signer policies, and pricing at scale.

### 4.4 Release 1 build (2026-11-17): released, see 4.5 for what happened after

Owner: "keep continue until done and i will review". Built locally, **nothing committed, pushed, deployed or migrated**, no wallet made, nothing registered.

What is in the code:

| Part | Files |
|---|---|
| Migration (not applied) | `supabase/migrations/20261118000100_trench_agents.sql`: `trench_settings` (both switches **off**: `enabled`, `new_agents_open`; caps: $100 per agent, $5,000 total, $200 per token across all Zolva agents, 3 buys per token per minute, 3 agents per owner), `trench_agents`, `trench_positions`, `trench_trades`, `trench_decisions`, `trench_executions` (one order per agent/minute/token/side), `trench_token_checks`, `trench_minutes` (one run per minute). RLS on, server only |
| Engine | `lib/trench/rules.ts` (one rule format, "almost_bonded" preset = Lab rule v3, locked guards, `parseTrenchRules`), `lib/trench/engine.ts` (`runMinute`, stages, exits, limits, crowding) |
| Execution | `lib/trench/check-build.ts`, `executor.ts` (Rushr build → checkBuild → Privy sign → fee follow-up), `policy.ts` (per-agent Privy policy, no message signing), `curve.ts`, `rushr-api.ts`, `social.ts` (DEX paid, X, narrative veto), `callouts.ts`, `crypto.ts` (AES-GCM for Rushr keys) |
| Runner | `lib/trench/runner.ts`, `app/api/cron/trench/route.ts`, `custom-worker.ts` + `wrangler.jsonc` (second cron `* * * * *` on the same Worker; does nothing while no agent is active) |
| Onboarding | `lib/trench/onboard.ts`, `app/api/trench/agents/*`: create (risk screen), agent wallet (extra Privy embedded wallet, same Privy user check, signer + policy), Rushr sign-up (user signs in the browser), start, pause, sell everything, withdraw and close |
| UI | `/trenches` (create button and "Your trench agents" when open), `/trenches/new`, `/trenches/[id]` (owner only), `TrenchCreate`, `TrenchSetup`, Privy bridge `createAgentWallet` + `signMessage` |
| Rules and deploy | CLAUDE.md engine rule; `deploy:prod` passes `TRENCH_KEY_SECRET`, `X_API_KEY`, `TRENCH_NARRATIVE_MODEL` |
| Tests | `lib/trench/engine.test.ts`: 29 cases (Lab exits, stages, limits, curve and checkBuild cases on the preset; runMinute, crowding, total stop, policy, texts). Full suite 157 files / 1,546 tests pass; tsc and eslint clean |

Not verified (needs the release test with house money):
- Privy: `createWallet({ createAdditional: true })`, adding Zolva's signer to that second wallet, `owner_id` being equal for both wallets of one user, and `signMessage` from the second wallet.
- The full minute against the live chain and Rushr (the runner has no unit test with a fake database).
- Rushr sign-up from the Worker: Rushr allows 5 successful sign-ups per day per IP; Cloudflare IPs are shared. Ask the dev for an allowance (4.2) before opening.

Known gaps, in order of importance:
1. If Rushr is down, sells fail until it is back (no direct curve/router sell fallback yet). The stop loss can overshoot meanwhile.
2. Terms page: memecoin risk and who the operator is are not on `/terms` yet (legal wording: owner).
3. The Lab agent's exposure is not in the crowding cap (it runs on the VPS).
4. Many agents in one minute run one after another in one Worker call; past ~20 active agents, fan out with Queues.
5. The policy's ETH cap is set at wallet setup from that day's ETH price (1.5x the largest buy). If ETH falls a third, buys are refused by Privy (fails safe).

Release steps, each with the owner's yes:
1. Review the code; commit and push.
2. Apply the migration; set `TRENCH_KEY_SECRET` (32 random bytes, base64) and `X_API_KEY` in `.dev.vars`; deploy.
3. Release test: owner sets `new_agents_open` for the owner only (or temporarily), creates one agent with email login and ~$30, sets `enabled = true`, watches 48 h (decisions, fees paid, callouts, Rushr record vs ledger, withdraw).
4. Then `new_agents_open = true` for everyone.

### 4.5 Status (2026-11-20)

What shipped (all live on zolvaagent.app): Trenches open to everyone (owner's call) with Curve Rider (was Almost
Bonded), Graduated Safe and "Your own rules" (edit a preset, guards locked, a Require X checks toggle); one-form
setup with no Privy popups (the server makes the wallet, signs Rushr's sign-up and hands the wallet to the user);
funding with copy and Rabby/MetaMask; capital = what the wallet holds at Start (max $100); archive; agent page with
header controls, strategy strip and a terminal decision log (one scan line a minute); fills read at fixed blocks with
Rushr's fee in P&L; exact token amounts and sells capped at the wallet balance; alert and auto-pause after 2 failed
sells; a Trench agents (beta) section in /terms.

What the test showed: 14 closed trades across @vyz1 and the Lab agent, all losses (-$26.02). The pre-registered
backtest (every PONS launch of 14 days; 11,415 launches, 47 graduated) is NO-GO: Curve Rider with exit v2 -22.4% per
trade over 207 entries (v1 -32.5%). The only filter that matters is "DEX profile paid within 90 min" (about
break-even, +1.0%, but it fails at 2x costs). Details: docs/perps-research.md "Trench backtest".

Where it stands:
- Both bots paused for buys. Exit v2 is built and tested but not deployed (commits 2b1e3c2 + 7417ab8 on branch
  backup/main-pre-align-20261118, migration 20261118000500 not applied).
- Next gate (Research, 0ed941b): a DEX-paid preset (variant B with exit v2) must pass on launches from 2026-11-19,
  rerun after at least 7 days. Only then real money again, with that preset.
- Open: Rushr's 5 sign-ups per day per IP (ask the dev); the backtest result on the /trenches preset cards.

### 4.3 Later
Custom trench agents (edit a preset's rules or write them in words via the strategy writer; guards locked), more presets, AI veto, owner linking on Rushr, A as an add-on for existing live agents.

## 5. Owner decisions

1. ~~Scope~~ **DECIDED 2026-11-17**: B straight away, open, real money, at each user's own risk (section 2).
2. ~~House rule change~~ **DECIDED 2026-11-17** (owner: "keep continue until done and i will review", after the recommendation): `lib/trench/` `runMinute` is the one decision function for trench agents next to `runHour`; trench tokens skip the address allowlist but must come by address from Rushr's list, have a curve from the PONS factory on chain, pass Rushr's safety check and `checkBuild`. CLAUDE.md updated.
3. ~~Public or private~~ **DECIDED 2026-11-17** (same answer): trench engine and presets in the public repo. Crowding mitigations are part of release 1: a cap on all Zolva agents' exposure per token, a cap on buys per token per minute, agents processed in random order.
4. ~~Runner~~ **DECIDED 2026-11-17** (owner: "ok setuju, pakai Cloudflare Worker"): user agents run in a separate Cloudflare Worker with a one-minute cron; the shared VPS keeps only the Lab agent.
5. **Wallets:** a dedicated user-owned Privy wallet per agent (recommended), and Zolva never funds agent wallets.
6. **Caps and legal:** per-agent cap ($100 proposed), global cap, and lawyer review before release 1 (recommended; `mvp-plan.md` says one is needed before real money for other people).
7. **Tonight:** release 0 (public `/trenches` page with the Lab record + notify list) instead of user agents tonight?
8. **Fees:** no Zolva fee at release? Zolva's Rushr referral code, and how to disclose it if Zolva earns from it?
9. **Naming:** reserve `zolva_*` handles for house/Lab agents; default bio text for user agents.
10. **Callouts:** on by default for trench agents?
11. **Presets:** Almost Bonded at release; Graduated Safe next after a house-money run; Fresh Launch only with an edge.
12. **Rushr dev:** OK to send the 4.2 questions, and keep it a listing/tool, not a partnership announcement?
