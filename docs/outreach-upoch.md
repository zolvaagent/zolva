# Upoch (@upochtech) inbound DM (2026-11-14)

The DM is a message request from @upochtech, which is verified and joined in October 2026. It came in through zolva-x.

**What they offer:**
- Their SDK wraps our hourly loop, so every decision is checkpointed on Robinhood Chain.
- An Upoch Score for our agents on their Agent Hub.
- A Risk Check for real-money agents before anything is signed.
- Telegram alerts for our users.
- They offered to open the PR in our repo themselves.

## What Upoch is (from upoch.tech, read 2026-11-14)

**What it does**
- A checkpoint, verify and recover layer for agent workflows on Robinhood Chain (4663).
- Only hashes and the parent link go on chain. The state itself is encrypted and stored on IPFS or Arweave.
- Checkpoint contract: 0x6179d9123c3c1f9e82f948101a4350cb55aa8c27.
- Gas: the docs show the workflow's own executor account paying. It is not confirmed that Upoch pays.

**Code and token**
- SDK: @upoch/sdk on npm, plus a verify-only Python package. No GitHub link or license on the site.
- It has a token (CA 0xdafaa1ed…6977, with a CoinGecko page). The token unlocks tools and credits, and staking pays no rewards.

**Risk signals**
- No named team or company.
- Security is "internal review only", with no audit and no bug bounty yet.
- Their own site advises starting with low-value workflows.
- Live numbers: 5 workflows, 202 checkpoints, 0 recoveries. These include the team's own test workflows.
- Upoch Score: no formula is published.

## Recommendation
- Reply, and be open to a chat.
- Keep their code out of `runHour` and the live signing path:
  - `runHour` is the only place decisions are made, and the repo rules forbid duplicating it.
  - A third-party Risk Check in front of real-money signing is out of the question while they have no audit.
- Offer the read-only path. Public agents' hourly decisions and reasons are already on our public API and MCP. Upoch can read those and checkpoint them with their own executor and gas. That gives the same "can't be edited" proof without touching our loop.
- Say no to a PR for now, and don't accept any PR without Development's review and the owner's yes.
- No token tie-ins and no "partnership" wording. A post about this would be a listing.
- Option to keep in mind: we could post our own daily hash of all decisions on chain. That fits the "agent wallets anyone can watch on-chain" note in docs/mvp-plan.md 8b and needs no third party.

## Upoch's answer (2026-11-14, 4:07 PM, from the owner's screenshot)

> Thanks, appreciate it. Yes, we can start from your public API. Here's the plan: a small Upoch reader pulls each public agent's hourly decisions from /agents/{id} and writes them as one checkpoint per agent per hour on Robinhood Chain. Each checkpoint holds the decision, the reason, the rule checks and a hash of the exact API response, and nobody can change it after it's written. Anyone can then verify any hour against the chain, in our explorer or with our TypeScript and Python SDKs.
>
> We'll cover the gas for the pilot. Pick 2 or 3 agents to start with, and we'll send you a live link once the first day is on-chain.
>
> One thing we'll say clearly: because the records come from your API, each checkpoint proves "this is what Zolva published at this hour, and it wasn't edited later." It doesn't prove what happened inside the agent. The deeper step is your agents writing their own checkpoints through our SDK. Happy to talk about that once the pilot runs.

**What this means:** they accepted the read-only path, they pay the gas, and they named the limit of the proof themselves. Nothing touches our code.

## Pilot agents (picked 2026-11-15 from the public API)

All are public paper agents by Zolva, active, with a tick at 02:00 UTC on 2026-11-15.

| Agent | id | Strategy | Markets | Why |
|---|---|---|---|---|
| Chip Breakout | `be4b8f92-031d-4ae1-a5e9-c12583ff1d20` | Custom breakout (buys above the 72h high, sells below the 48h average −2%) | NVDA, MU, TSM (stock tokens, spot) | The oldest agent (since 2026-10-15, 739 hours, 22 trades). A clear rule that anyone can check against each hour's numbers. |
| Twin · RSI Dip + AI | `b4cca798-68a1-4064-b750-92f6e1e06bb0` | Custom RSI dip with the AI co-pilot | NVDA, TSLA, AAPL (stock tokens, spot) | Shows that a checkpoint also covers an agent with AI review. It has a rules-only twin (`bdf114e1-…`), which we can add later for a side by side. It holds TSLA right now, so the record covers an open position. |
| Lab · Perps Deep Dip Alts | `8482ba4c-a4ad-47b5-b6d2-222ecdf5cc5f` | Custom deep dip, long only | HYPE, ZEC, XRP, LIT, NEAR perps (Lighter, paper) | Covers crypto and perps, and it is the most active of the three (17 trades in 120 hours), so the first day will likely include real trades, not only holds. |

**Not picked:** the Lab crypto spot agents (ETH, BTC) have made no trade since 2026-11-05, so a first day would be all holds. The new Vol Trend agents are less than a day old. The user-made public agents stay out, because their owners didn't opt in to a third party.

**Practical notes for Upoch:** our hourly run lands at about :05 past the hour (with a backup at :07), so reading from :15 is safe. `/agents/{id}` keeps the last 24 hours of decisions, so a missed hour can be caught up.

## DM reply draft v3 (answer to their plan, 2026-11-15)

> Sounds good, thanks for covering gas! Agree on the framing too.
>
> Let's start with these 3:
> zolvaagent.app/agents/be4b8f92-031d-4ae1-a5e9-c12583ff1d20
> zolvaagent.app/agents/b4cca798-68a1-4064-b750-92f6e1e06bb0
> zolvaagent.app/agents/8482ba4c-a4ad-47b5-b6d2-222ecdf5cc5f
>
> Our run lands around :05 each hour. What will the explorer link look like, and how often do checkpoints land?
>
> SDK talk after the pilot 👍

The owner sent this short version on 2026-11-15 at 11:09 AM.

## Upoch's answer 2 (2026-11-15, 3:58 PM)

> Great, those 3 work. How it'll run: each of your agents gets its own Upoch workflow on Robinhood Chain mainnet, with its own page: upoch.tech/app/agents/<id>. We'll send the 3 links once they're registered. Timing: one checkpoint per agent per hour, at about :15. That leaves room after your :05 run and your API's 5-minute cache. Each checkpoint covers that hour's decisions (market, action, reason, notes, rule checks) plus a hash of your exact API response, so anyone can check that hour later. We'll run it for a few days, then send you a short summary before anything gets posted.

## DM reply draft v4 (2026-11-15)

> Perfect, thanks! Looking forward to the links. And yes, please share the summary and any post text with us first.

The last line keeps the post wording in our hands (no "partnership" and no returns talk).

The owner sent v4.

## Upoch's answer 3: post text for review (2026-11-15, 10:39 PM)

They plan a launch post, then one reply per hour in the same thread with that hour's decisions. They want to post today and would like a post from us too. Their launch text:

> Upoch × @zolva_Agent 🤝
>
> Zolva's AI trading agents now checkpoint every hourly decision on Robinhood Chain mainnet through Upoch.
>
> Each hour: decisions, trades, and a SHA-256 of the exact API response, on-chain. Anyone can open and verify any hour.
>
> Chip Breakout → upoch.tech/app/agents/6
> Twin · RSI Dip + AI → upoch.tech/app/agents/7
> Lab · Perps Deep Dip Alts → upoch.tech/app/agents/8
>
> Paper trading. Hourly log below

**Links checked 2026-11-15:** pages 6, 7 and 8 load and show "Zolva: Chip Breakout", "Zolva: Twin · RSI Dip + AI" and "Zolva: Lab · Perps Deep Dip Alts", in the same order as the post.

**What to fix:**
- "×" and 🤝 read as a partnership. It's a pilot.
- "AI trading agents" is wrong: the agents run on rules, and only one has an AI co-pilot.
- "every hourly decision" sounds like all of Zolva. It's 3 public paper agents.
- Their own honest line ("proves what Zolva published, not edited later") is missing.
- 24 hourly replies a day shouldn't tag us.

## DM reply draft v5 (2026-11-15)

> Looks good, thanks! A few small edits:
> • Drop the "×" and 🤝, it's a pilot
> • "AI trading agents" → "public paper agents" (they run on rules, one has an AI co-pilot)
> • Add your line that it proves what Zolva published each hour, not edited later
> • Please don't tag us in the hourly replies
>
> Something like:
>
> Upoch now checkpoints 3 of @zolva_agent's public paper agents on Robinhood Chain mainnet.
>
> Each hour: their decisions and reasons, plus a SHA-256 of Zolva's public API response, on-chain. Anyone can verify any hour: proof of what Zolva published, and that it wasn't edited later.
>
> Chip Breakout → upoch.tech/app/agents/6
> Twin · RSI Dip + AI → upoch.tech/app/agents/7
> Lab · Perps Deep Dip Alts → upoch.tech/app/agents/8
>
> Paper trading. Hourly log below
>
> We'll quote it once it's live 👍

**Owner's call (2026-11-15):** accept their post as is, with no edits. v5 is dropped.

## DM reply draft v6 (2026-11-15, replaces v5)

> Looks great, go ahead! Roughly what time will it go out? We'll quote it once it's live 👍

**Live 2026-11-15 16:51 UTC:** https://x.com/upochtech/status/2122009591261409504. The text is the same as the one we reviewed, with an image.

**Quote post v2 (owner asked for longer and more official, "Zolva × Upoch", 2026-11-15):**

> Zolva × Upoch
>
> Starting today, 3 of our public paper agents write an on-chain checkpoint every hour on Robinhood Chain mainnet, through @upochtech.
>
> Each checkpoint records that hour's decisions, the reason behind each one, the rule checks, and a SHA-256 hash of our public API response. Once it's written, it can't be changed.
>
> What this proves: what Zolva published each hour, and that it wasn't edited later.
>
> The 3 agents in the pilot:
> • Chip Breakout: NVDA, MU, TSM
> • Twin · RSI Dip + AI: NVDA, TSLA, AAPL, with an AI co-pilot
> • Lab · Perps Deep Dip Alts: crypto perps
>
> Anyone can open any hour and check it.
>
> Paper trading, virtual money.

**Posted:** the owner posted the quote with the Zolva × Upoch video (video/demo/zolva-upoch-1920x1080.mp4) on 2026-11-15.

## DM reply draft v7 (2026-11-16, after our quote post)

> Quoted it, thanks team! Looking forward to the summary after a few days. If anything breaks on our API side, just ping us here.

**Public reply under their post (sent by the owner 2026-11-16):**

> Glad to have our agents' hourly decisions on-chain. Every hour, anyone can check that what we published wasn't edited later 🤝

**Quote post v1 (too short, replaced):**

> 3 of our public paper agents now get an hourly on-chain checkpoint from @upochtech. Each one proves what Zolva published that hour, and that it wasn't edited later.

The SDK step stays open, with no commitment. Their SDK would wrap `runHour` and the live signing path, which needs Development's review and the owner's yes.

## DM reply draft v2 (shorter, owner's call 2026-11-14: early ecosystem, most projects aren't audited)

> Hey Upoch, thanks! Congrats on 2.2. On-chain checkpoints for every decision sounds great, happy to chat.
>
> Easiest start: our public API/MCP already has every public agent's hourly decision and reason (zolvaagent.app/docs/public-api). Could you checkpoint from there first? Then we see what fits deeper. Who covers the gas?

## DM reply draft v1 (longer, replaced by v2)

> Hey Upoch team, thanks for reaching out, and congrats on 2.2.
>
> Decision records that can't be edited after the fact are close to what we care about, so happy to chat.
>
> One thing up front: our hourly loop and the real-money signing path stay in our own code for now, so we won't add an SDK wrapper or an outside risk check there.
>
> What could work without touching our loop: public agents' hourly decisions and their reasons are already on our public API and MCP (zolvaagent.app/docs/public-api). Could Upoch read those and checkpoint them on your side?
>
> A few questions first:
> 1. Who pays gas for the checkpoints?
> 2. Is the SDK and contract source public, and is an audit planned or done?
> 3. How is the Upoch Score calculated?

## Status
- [x] 2026-11-14: The owner accepted the request and sent the v2 reply.
- [x] 2026-11-14: Upoch accepted the public API path and will pay the gas for the pilot.
- [x] 2026-11-15: The owner sent the short v3 (3 pilot agents). Upoch confirmed: checkpoints at about :15 each hour, one page per agent at upoch.tech/app/agents/<id>.
- [ ] Owner sends v4 (short thanks, and asks to see the summary and post text first).
- [ ] Wait for the 3 agent links, then check a few hours against our API.
- [ ] Check their live link once the first day is on chain: the hashes should match our API responses for those hours.
- [ ] SDK talk only after the pilot, and only with Development's review and the owner's yes.
