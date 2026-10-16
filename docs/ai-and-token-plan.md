# Zolva: AI agents and the agent token ecosystem (proposal, 2026-10-16)

Status: Phase A approved and built on 2026-10-16 (co-pilot on rule signals, $0.50 free credits per account for Lite models, top-up coming soon). Phases B and C are still proposals. Prices were read live from the
OpenRouter API on 2026-10-16; Pons facts come from docs.ponsfamily.com/v2 on the same day.

## 1. The idea in one paragraph

Agents get a real AI brain (an LLM from OpenRouter, several models to choose from). An agent
that proves itself can get its own token, launched on Pons through Zolva. Part of the creator
fees from that token pays for the agent's AI, so a good agent can keep itself alive. Other people
may also launch a token on top of someone else's agent ("passengers"); then the fees are shared
with the original creator and the agent's AI budget.

## 2. Where the AI sits (and why not everywhere)

Our strongest promise today is honesty: every agent can be backtested and every decision is
explained. A pure LLM agent breaks that (the same data can give a different answer, and a 30 day
backtest costs 720 model calls). So the AI goes on top of the rules, not instead of them:

| Layer | What the AI does | Safety net |
|---|---|---|
| **1. AI strategy writer** (Studio) | User writes in plain words ("buy sharp dips in big tech, sell on recovery"); the AI turns it into rules the Studio already understands, then the normal 30 day backtest runs | One call per strategy, almost free; result is plain rules the user can read and edit |
| **2. AI agent** (new agent type) | Each check, the AI reads the stock's indicators, open positions and the rule signals, then decides buy, sell or hold and writes its reasoning | The engine still enforces max position, stop loss and the 5 agent cap; the AI can never trade outside those limits; output must be valid JSON or the hour falls back to the rules |
| **3. AI weekly review** (later) | Reads an agent's last week and suggests rule changes | Suggestions only; the user applies them |

AI agents show a **live track record only** (clearly labelled), plus an optional short backtest on
the cheapest model, because a full LLM backtest costs real money per run.

## 3. Models and cost per agent per month

Assumptions: one decision = about 3,000 input tokens (indicators, positions, rules, last decisions)
and 400 output tokens (JSON decision + reasoning). An hourly agent makes 720 decisions a month.
"On signal" means the AI is only asked when a rule fires (about 30 times a month).

| Tier | Model (OpenRouter id) | $ / 1M in / out | Hourly | Every 4 h | On signal |
|---|---|---|---|---|---|
| Lite | DeepSeek V4.1 Flash (`deepseek/deepseek-v4.1-flash`) | 0.018 / 0.684 | $0.24 | $0.06 | $0.01 |
| Lite | Claude Haiku 5.5 (`anthropic/claude-haiku-5.5`) | 0.10 / 0.50 | $0.36 | $0.09 | $0.02 |
| Lite | Qwen 3.8 Flash (`qwen/qwen3.8-flash`) | 0.15 / 0.47 | $0.46 | $0.11 | $0.02 |
| Lite | GPT-5.6 Luna (`openai/gpt-5.6-luna`) | 0.20 / 1.20 | $0.78 | $0.19 | $0.03 |
| Standard | Gemini 3.8 Flash (`google/gemini-3.8-flash`) | 0.825 / 4.125 | $2.97 | $0.74 | $0.12 |
| Standard | GPT-5.4 mini (`openai/gpt-5.4-mini`) | 0.75 / 4.50 | $2.92 | $0.73 | $0.12 |
| Pro | Grok 4.7 (`x-ai/grok-4.7`) | 2 / 6 | $6.05 | $1.51 | $0.25 |
| Pro | Claude Sonnet 5.5 (`anthropic/claude-sonnet-5.5`) | 2 / 10 | $7.20 | $1.80 | $0.30 |
| Pro | GPT-5.6 Terra (`openai/gpt-5.6-terra`) | 2 / 12 | $7.78 | $1.94 | $0.32 |
| Max | Claude Opus 5.5 (`anthropic/claude-opus-5.5`) | 4 / 20 | $14.40 | $3.60 | $0.60 |
| Max | GPT-5.6 Sol (`openai/gpt-5.6-sol`) | 4 / 20 | $14.40 | $3.60 | $0.60 |

Notes:
- Thinking/reasoning modes can multiply output tokens 2 to 5 times; keep them off for hourly
  decisions, or count them in the price shown to the user.
- Prompt caching (same system prompt every hour) can cut the input part a lot on models that
  support it.
- OpenRouter charges a small fee when buying credits; budget about 5% on top.
- At scale: 1,000 AI agents on a Standard model hourly is roughly $3,000 a month. That is why the
  fuel model below matters; Zolva can afford a free Lite tier, not free Pro agents.

**Recommended default:** every new AI agent gets the Lite tier (Claude Haiku 5.5 or DeepSeek V4.1
Flash) on the house, around $0.25 to $0.40 per agent per month. Better models need fuel.

## 4. Fuel: how an agent pays for its own AI

Each AI agent has a **fuel balance** in USD credits. Every model call burns a little. When fuel
runs out, the agent falls back to its plain rules (it never stops abruptly in the middle of a
position) and the page says so. Fuel comes from:

1. The free Lite allowance from Zolva.
2. The creator topping up (later, with USDG).
3. **Token fees** (section 5).

How much token trading keeps an agent alive (Pons trade fee 1%, creator share about 70% as
reported, and 20% of the creator share going to fuel):

| Model, hourly | Monthly AI cost | Monthly token volume needed |
|---|---|---|
| Claude Haiku 5.5 | $0.36 | about $260 |
| Gemini 3.8 Flash | $2.97 | about $2,100 |
| Claude Sonnet 5.5 | $7.20 | about $5,100 |
| Claude Opus 5.5 | $14.40 | about $10,300 |

So even a small, real community can keep a Pro agent alive. The exact Pons split must be read
on chain (`getLaunchFeePolicy(token)`), the docs don't publish the numbers.

## 5. Agent tokens on Pons

### How Pons works (v2, from its docs)

- Factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` on Robinhood Chain. Anyone (once
  whitelisted) calls `launchToken(TokenParams, launchConfigId, pairToken)`; the token starts on a
  bonding curve and graduates into a Uniswap v4 pool when the curve sells out.
- `TokenParams.creatorFeeRecipient` decides who earns the creator fees. It can be changed later
  only by the current recipient (`transferCreatorFeeRecipient`). Fees collect in a `FeeEscrow`
  contract and are pulled with `claim()` / `claimToken()`.
- **Public launches are closed right now: only whitelisted addresses can create tokens.**
- **v2 is unaudited** (three reviews in progress, none closed).
- No integrator or referral fee exists; partnership contact: contact@ponsfamily.com.

### What "using Pons tech" means

The right word is **integration**: Zolva's own interface calls Pons's contracts, and tokens
appear on Pons like any other launch. The part that resembles "wrapping" is our own small
**wrapper (router) contract**: it calls the Pons factory and sets **itself** (an `AgentVault`) as
`creatorFeeRecipient`, so fees can be split by rule instead of going to one wallet. We don't
copy or fork Pons; we build on top of it.

### Fee flow

```
token trades on Pons
  -> Pons FeeEscrow (creator share)
  -> AgentVault (our contract, claims from the escrow)
       -> fuel for the agent's AI       e.g. 20%
       -> the agent's creator           e.g. 60%
       -> original agent creator        e.g. 10% (only for passenger tokens)
       -> Zolva protocol                e.g. 10%
```

The percentages are placeholders to decide together.

### Passenger tokens

- Anyone may launch a token on top of an existing agent, but only through Zolva, so the
  AgentVault always pays the original creator and the agent's fuel.
- The original creator can opt out of passenger tokens for their agent.
- Every passenger token page says clearly who built the agent and who launched the token.

### Who can launch

Proposal: only agents with at least 30 days of live track record. The token page always shows
that record next to "holding the same stocks", including losses.

## 6. Risks to settle before building tokens (important)

1. **Securities law.** A token whose story is "this agent makes money trading stocks" invites
   people to buy it expecting profit from someone else's work. In many countries that looks like
   an investment contract, and the underlying assets are already US stock tokens restricted for
   US persons. Rules to keep: the token has no claim on the agent's trading profits, Zolva never
   promises returns, and **a lawyer reviews the design before launch.**
2. **Paper vs real.** Agents trade virtual money today. A token sold on a paper track record must
   say so on every screen. A stronger version waits for real money trading.
3. **Unaudited contracts.** Pons v2 is unaudited and our AgentVault would hold real funds: it
   needs its own audit, and a cap on what it holds until then.
4. **Whitelist dependency.** We need Pons to whitelist our wrapper contract (or open launches).
5. **Impersonation.** Passenger tokens can copy names; launches only through Zolva, clear labels,
   and a report button.
6. **LLM failure modes.** Prompt injection (later, if agents read news), invalid outputs, model
   outages: the engine's limits and the rules fallback cover these.

Precedent worth studying: Virtuals Protocol (AI agent tokens whose fees fund the agents).

## 7. Phased plan

| Phase | What | Needs | Rough size |
|---|---|---|---|
| **A. AI agents** | OpenRouter integration, AI agent type in Studio with model tiers and cost shown, fuel balance (Zolva funded), decision guardrails, AI reasoning in Activity, live-only track record | OpenRouter key (you add it), approval of the models list | 1 to 2 weeks |
| **A2. AI strategy writer** | Plain words to rules in Studio | Phase A plumbing | 2 to 3 days |
| **B. Token design** | Final fee split, launch rules, passenger rules, legal review, Pons partnership and whitelist | Lawyer, Pons contact | Mostly waiting on others |
| **C. Agent tokens** | AgentVault + wrapper contracts, audit, launch flow in the app, fuel from fees, token pages | B done, audit budget | 3 to 5 weeks + audit |

Phase A is valuable on its own and carries no token risk, so it can start while B is in progress.

## 8. Decisions needed from you

1. Approve Phase A, and which tiers to offer at launch (recommended: Lite free, Standard and Pro
   with fuel).
2. Which cadence by default: hourly, every 4 hours, or AI only when a rule fires (cheapest).
3. Do you want to contact Pons now for the whitelist? (Phase C cannot happen without it.)
4. Placeholder fee split in section 5: keep or change.
