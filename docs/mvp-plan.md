# Zolva: MVP plan

> Brand: **Zolva** (2026-10-15). First Pitwise, then Sita ("Super Intelligence Trading Agent"), renamed again because Sita reads as a woman's name in Indonesia and clashes with SITA, the aviation IT brand. Zolva is an invented word (sounds like *solve*), gender neutral, and zolva.xyz looked free. Folder, package and Worker names still say `pitwise`.

**One line:** no-code AI trading agents for tokenized US stocks on Robinhood Chain. You can backtest an agent before it goes live.

Status: plan, waiting for approval (2026-10-15). Data check: [phase-0-findings.md](phase-0-findings.md). Tasks: [tasks.md](tasks.md).

## 1. Problem and promise

Non-US crypto traders can now hold AAPL, NVDA, SPY and similar stocks as tokens on Robinhood Chain, trading 24/7. Most of them have a market opinion but can't code a bot and won't watch charts all day.

**Pitwise:** pick a strategy, see how it would have done over the last 30 days, launch it, and watch it trade with full reasoning on a public page.

**Competitor:** [Heurix](https://www.heurix.xyz/docs), on the same chain, paper trading in beta, with an $HRX token. Where we differ:

| | Heurix | Pitwise |
|---|---|---|
| Assets | Not stated | Tokenized US stocks only (20 at launch) |
| Before launch | Wait hours for first trades | **30-day backtest in the Studio** |
| Results | Visible to beta testers | Public leaderboard + shareable agent pages |
| Token | Live before the product | None until the product is proven |

## 2. Target users

- **Primary:** non-US, crypto-native retail who want US stock exposure without coding (Southeast Asia incl. Indonesia, Latin America, EU, Africa).
- **Secondary:** crypto Twitter creators who build agents and share results. They are our distribution.
- **Excluded:** US persons, and probably UK, Canada, Switzerland and UAE (to confirm). Geo-block plus a terms checkbox from day one.

## 3. MVP scope

### In scope (Phase 1)
- **Wallet sign-in** (Sign-In with Ethereum). Free signature, no gas.
- **Studio:**
  - agent name
  - strategy: Momentum or Mean Reversion
  - virtual capital
  - max position per asset (% of equity)
  - stop loss (%)
  - 1–3 stock tokens
- **Engine:** every hour it fetches new candles, runs each active agent and simulates fills at the close minus 0.5% cost. Every decision is logged with plain-language reasoning.
- **Agent page:** equity curve, cash, positions, trades, decision log, pause/resume.
- **Leaderboard:** all agents ranked by return since start, with drawdown.
- **Limits:** up to **5 running paper agents** per user (1 live agent later), each with its own virtual capital; paused agents don't count. Agents can't be edited (pause it, then make a new one). Decided 2026-10-15; the cap keeps the leaderboard from being won by mass-launching random agents.
- **Paper trading only.** No funds move.

### Phase 2 (the edge)
- **Backtest in the Studio.** "Would have returned X% over the last 30 days," with an equity chart, before you press Launch. It reuses the same engine code, so backtest and live results always behave the same.

### Phase 3: real trading (confirmed goal, 2026-10-15)
Paper trading comes first; real trading follows. The MVP must not block it. See "Real trading: design constraints" below.

### Out of scope (later, only with real users)
- Plain-language strategies written by an LLM, more strategies, alerts
- A token. Not before the product has proven retention.

## 4. Strategies (v1 rules)

Both run on **hourly closing prices**. Each is a pure function: `(prices, position, params) → decision + reasoning`.

**Momentum (trend following)**
- Buy when price is above its 48-hour average **and** up more than 3% over 24 hours.
- Sell when price drops 3% below its 48-hour average.

**Mean Reversion (buy the dip)**
- Look at how far the price is from its 48-hour average, in standard deviations (z-score).
- Buy when z < −2.5 (unusually low).
- Sell when z ≥ 0.5 (back above average).

> **Tuned 2026-10-15 on 30 days of real data.** The first draft (24h average, 1% entry) traded 100+ times a month and lost up to 42% to the 0.5% cost. Even tuned, **neither strategy beat simply holding** across 10 test token sets (holding averaged +2.9%; best settings averaged −0.5% to −1%). That is a product risk, not just a tuning detail. See "Risks".

**Shared rules**
- Position size: up to the user's max % of equity per asset.
- Stop loss: sell if the price is X% below entry. Checked each hour, so it can overshoot.
- Warm-up: an agent holds until it has 48 hours of data. Since we store history, new agents start trading at once.
- Fill: the hourly close, with 0.5% cost on every buy and sell.

Thresholds stay fixed (not user-editable) in the MVP. Rechecked in session 1.3 on three separate 30-day windows of real data: both strategies still trail buy and hold in every window, so the thresholds were kept (more tuning on ~3 months of data would overfit). Prices pass through a forward-fill and an outlier filter first (`lib/engine/series.ts`).

## 5. Tech stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js 16 + Tailwind, on Cloudflare Workers (OpenNext) | Same as Loopa |
| Database | Supabase (Postgres) | Same as Loopa and community-fund. Free tier |
| Scheduler | Supabase **pg_cron** → `/api/cron/tick` every hour | Loopa's Cloudflare cron never fired, and pg_cron is the trigger that worked there |
| Wallet login | viem only (sign + verify), copied from Loopa | No wagmi/RainbowKit needed, so fewer packages |
| Prices | GeckoTerminal API: one multi-pool snapshot per hour + rolling OHLCV repair (3 calls a tick) | Free tier rejects ~half of one-call-per-token traffic; on-chain pool reads are the upgrade path |
| Tests | Vitest for the engine | Strategy math must be correct |

Changes from the first draft: **Supabase instead of D1** and **hourly prices only, instead of 15-minute sampling**.
- Supabase: matches Loopa's working cron setup and your other projects.
- Hourly only: the agents decide hourly anyway, and it keeps live and backtest identical.

New packages: the same set as Loopa (next, react, viem, @supabase/supabase-js, tailwind, @opennextjs/cloudflare, wrangler, vitest). I'll confirm before installing.

## 6. Data model (draft)

```text
tokens        symbol, address, price_pool, history_start, enabled
candles       token, ts (hour), open, high, low, close            -- shared by live engine + backtest
wallets       address, country, terms_accepted_at, created_at
agents        id, owner, name, strategy, params (json), tokens[], start_capital, cash,
              status (active|paused), mode (paper|live, fixed at launch), trading_wallet (live only)
positions     agent, token, quantity, avg_entry_price
executions    live only: agent, token, side, decided_ts, intended qty/usd, decision + oracle price,
              max_slippage_bps, status (pending|submitted|confirmed|failed|cancelled),
              tx_hash, fill qty/price, gas, error
trades        agent, ts, token, side, quantity, price, cost, execution_id (live only)
agent_runs    agent, ts, equity, cash, decisions (json), reasoning
```

Live-trading hooks (added 2026-10-15, unused until Phase 3):
- Active agents per owner are capped by a trigger: 5 paper, 1 live (`agents_active_limit`, migration `active_agent_limit`). Replaces the earlier one-active unique index.
- A trigger blocks changing `mode` after launch.
- An agent with executions can't be deleted (`on delete restrict`), so the real-money history stays.
- One execution per agent, hour, token and side, so a retried tick can't send a second order.

## 7. Pages

| Route | What |
|---|---|
| `/` | Landing: promise, live leaderboard preview, Sign in |
| `/studio` | Build an agent (Phase 2 adds the backtest panel) |
| `/agents/[id]` | Public agent page |
| `/leaderboard` | All agents ranked |
| `/api/auth/nonce`, `/api/auth/verify` | Wallet sign-in, plus geo check |
| `/api/cron/tick` | Hourly: fetch candles → run agents (protected by secret) |

## 8. Phase 1 build plan

About 6 sessions. Each one ends with something you can see or check.

| # | Session | Done when |
|---|---|---|
| 1.1 | **Setup.** Next app, OpenNext, Supabase project + schema, token seed | App runs locally; tables exist; 20 tokens seeded |
| 1.2 | **Price data.** Backfill ~3 months of hourly candles; hourly ingest job | `candles` filled for all tokens; tick adds the new hour |
| 1.3 | **Engine.** Strategies, simulator, stop loss, cost; unit tests; tune thresholds on history | Tests pass; one-off backtest numbers look sane for both strategies |
| 1.4 | **Sign-in + Studio.** Privy login, geo-block, terms, create agents (up to 5 running) | You can sign in and create an agent |
| 1.5 | **Agent page + leaderboard.** Equity chart, trades, reasoning, pause/resume | Your test agent trades hourly and shows up ranked |
| 1.6 | **Deploy + self-test.** Cloudflare deploy, pg_cron live, 48h soak test | Runs 48 hours without missed ticks |

**Your design input matters most in 1.4–1.5:** the Studio, the agent page and the leaderboard. A Figma pass before 1.4 would help.

## 8b. Real trading: design constraints (Phase 3)

Real trading is a confirmed goal. Nothing below is built in the MVP, but the MVP is shaped so that real trading can be added rather than requiring a rewrite.

**What changes:** an agent trades the user's real stock tokens, every hour, while the user is offline. Someone has to sign those transactions.

**Custody options (decide before Phase 3):**

| Option | How | Trade-off |
|---|---|---|
| **A. Privy embedded wallet + scoped server signer** (recommended to evaluate first) | The user grants Zolva a revocable signer on their Privy wallet, limited by policy: only the swap router, only allowlisted stock tokens + USDG, max size per trade and per day | Fits the Privy login already chosen; check what Privy's policies can enforce and what it costs |
| B. Smart account with session keys (ERC-4337) | The user's smart account gives a session key the same limits on-chain | Limits enforced on-chain; more moving parts |
| C. Per-user vault contract | The user deposits USDG; our executor may only swap inside the vault | Simple rules, but we write and must audit a contract that holds user funds |

The user's `equity-router` contracts (already deployed on 4663) are a candidate execution layer for all three.

**Keep in the MVP so Phase 3 is additive:**
- The engine **decides**; a separate **executor** carries out the decision. Paper executor now, on-chain executor later, behind the same interface.
- `agents.mode` (`paper` | `live`), plus an `executions` table for live orders (transaction hash, status, actual fill price, gas) next to `trades`.
- Everything is per user (Privy user ID plus wallet), never a single global wallet.

**Before any real money:**
- ⚠️ **Legal review.** Trading tokenized securities automatically for other people may count as investment advice, portfolio management or brokerage, depending on the country. A lawyer must sign off before launch. Robinhood's own terms for stock tokens may also require eligibility checks.
- **Caps:** start invite-only, with a small limit per agent and a kill switch that stops all live agents at once.
- **Execution reality:** pools hold about $0.1M to $3.5M, so size, slippage, gas (ETH), failed transactions and MEV all matter. Check the price against Chainlink before every trade, and use a max slippage.
- **The honest track record matters more:** paper results so far lose to holding. Real money makes that worse, not better.
- **Security:** key handling, monitoring, an audit of any contract that touches funds.

## 9. Costs

The MVP is **$0/month**: Supabase free, Cloudflare free, GeckoTerminal free.
- Domain about $10/year.
- At launch, possibly a paid CoinGecko plan (see risks).

## 10. Risks

| Risk | Impact | Plan |
|---|---|---|
| Robinhood ships native agents | High | Ship fast; differentiate on backtest + public leaderboard + UX |
| Copycat tokens | High | Fixed address allowlist; verify against official list before launch |
| GeckoTerminal limits / commercial terms | Medium | One multi-pool call per hour; move to paid API or on-chain reads at launch |
| Off-hours DEX prices ≠ real stock | Medium | Label off-hours trades; consider a "market hours only" toggle later |
| Short history (~3 months) | Low | 30-day backtest window; hide tokens with too little history |
| Legal (stock tokens restricted) | Medium | Geo-block + terms from day one; paper trading only in MVP |
| Real trading = regulated activity | High | Legal review before Phase 3; invite-only with caps; geo-block |
| Agent signing keys / custody | High | Scoped, revocable signer (Privy policy or session keys); audit any contract holding funds; kill switch |
| Simple strategies lose to holding | High | Be honest about it (every agent shows "vs holding"); add better strategies later; consider positioning around discipline and risk control, not beating the market |

## 11. Decisions

- Login: **Privy, confirmed 2026-10-15.** "Go to app" opens Privy (Google, email code, or wallet). Email and Google users get a Privy embedded wallet, which is also the basis for scoped signers in live trading (8b). Replaces the viem-only SIWE planned for session 1.4. Accepted tradeoffs: vendor lock-in for accounts and embedded wallets, and per-active-user pricing (check before launch).
- Design language: follows aave.com (2026-10-15): Inter, white canvas, ink #252228, lavender #9896ff accent, expo-out motion. The approved reference is `prototype/` (also deployed as its own workers.dev Worker). Overrides the Inter ban and no-gradient-text rules of the landing page skill at the user's request.

- Name: **Zolva** (2026-10-15), replacing Sita (a common woman's name in Indonesia; SITA is also a big aviation IT brand) and earlier Pitwise. Invented word, no meaning to defend, pairs as "Zolva Agent". zolva.xyz and zolvaagent.com had no DNS on 2026-10-15 (not yet bought; confirm at a registrar). GitHub `zolva` is taken, so the org/user will need a variant.
- Chain: Robinhood Chain (4663). Assets: tokenized stocks only.
- Edge: backtest-before-launch + public leaderboard.
- Paper trading first, **real trading later** (confirmed 2026-10-15; design constraints in section 8b). No token.

## 12. Still open

- [ ] Approve this plan (stack changes: Supabase, hourly-only)
- [ ] Check `pitwise.xyz` / `@pitwise` availability
- [ ] Verify the 20 token addresses against Robinhood's official list
- [ ] Confirm the excluded-countries list
