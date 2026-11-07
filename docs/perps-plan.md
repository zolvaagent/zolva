# Perps plan (draft, 2026-11-07)

Goal: let Zolva agents trade perpetual futures, so short, swing and short-hold
strategies pay at low cost (about 0.05 to 0.1% per trade instead of 0.3 to 0.5% on
the DEX). Each phase has a gate; stop if a gate fails. Nothing here is built yet.

## Phase 0. Research (free, about 1 session)

Check the venues again: Lighter (Robinhood Chain's perps partner), Arcus (dYdX Labs
and Robinhood Crypto). Also check any other venue that lists stock perps.

Questions for each venue:
- Markets: which crypto and stock perps are listed, and with how much depth?
- Costs: maker and taker fees, funding rate history, minimum order size.
- Bot access: is there an API, and can a key trade without being allowed to withdraw?
  Are sub-accounts available?
- Access: geoblocks, KYC, and whether it can be offered to users later.
- Data: historical hourly prices and funding for the backtest.

Output: `docs/perps-research.md`.
Gate: at least one venue with bot API access, open to the owner, with markets we
already trade.

## Phase 1. Backtest at perps cost (free, about 1 session)

Extend `scripts/research-shorting.mts`:
- Cost per trade at the venue's real fee.
- Real funding history in place of the 10% a year borrow rate.

Strategies:
- Spike Fade
- Swing (long and short in one slot)
- A short hold: exit after 1 to 2 hours

Use the same windows as before, with stocks and crypto run separately.

Gate: positive in every window, at least 30 trades in total, and a worst drop of
10% or less.

## Phase 2. Paper perps mode (free, 2 to 3 sessions, then 2 to 3 weeks running)

**Status 2026-11-07:** code written for one rule (Lab · Perps Deep Dip on BTC, ETH, SOL perps), see docs/tasks.md. Waiting for migration, backfill and deploy.

- An agent setting `venue`, either `dex` (today) or `perps`. Perps agents use the
  venue fee and charge or earn funding every hour. There is no leverage (1x), so a
  position can never be liquidated.
- Change `lib/engine` and `prototype/engine.js` together (parity test), add a
  migration, and keep the public API and agent pages showing the venue.
- Lab agents for the strategies that passed Phase 1.

Gate: paper results stay close to the backtest over 2 to 3 weeks.

## Phase 3. Live, owner only (real money, small)

Custody is the big change: funds leave Robinhood Chain and the Privy policy no
longer covers them.
- A dedicated sub-account with a capped deposit ($20 to $50).
- An API key that can trade but cannot withdraw, stored as a Worker secret.
- An executor adapter for the venue, plus fills checked against the venue's records
  every hour.
- Auto-pause and a manual kill switch, as on the DEX.

Gate: the owner approves each step. Run for 2 weeks before thinking about users.

## Phase 4. Users (later)

Region and legal check for leveraged derivatives, deposit UX, risk disclosure.
Leverage only after that, if ever.

## Not planned

- Minute-level scalping. It needs minute data and a different engine.
- Leverage before Phase 4.

## Decisions for the owner

- Crypto only first, or stocks too, if the venue lists them?
- Is 1x (no leverage) acceptable for Phases 2 and 3?
