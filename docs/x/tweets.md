# Zolva on X: tweet drafts

Order: narrative quotes, teasers, launch (with token), Dex paid, dev supply burnt, then 11 product
posts. Counts follow X's rules (a link counts as 23 characters, emoji may count as 2). Facts were
checked against the live app and database on 2026-10-19; recheck numbers on the day you post.
Assets are not generated yet: the "Visual" line says what each post needs.

Placeholders to replace before posting: `$TICKER`, the contract address `0x000…`, the DEX
Screener link, the burn transaction and its percentage, and recheck the app link.

## Rules for every post

- Say **paper trading** whenever performance comes up.
- The token posts never promise returns, never link the token to the agents' trading profits, and
  never claim fees fund anything that is not built yet.
- Don't tag @RobinhoodApp or @RobinhoodCrypto in our own posts; quoting their posts is fine.
- Stock tokens are not available to US persons: no copy aimed at US users.

## Phase 1: Narrative quotes (before any teaser)

Quote these to sit inside a conversation that is already big. Never tag Robinhood in our own posts or imply a partnership; a quote is fine.

### Q1. Quote @RobinhoodCrypto "100 days" (recommended)

Quote: https://x.com/RobinhoodCrypto/status/2109719299606659207 (Oct 12, 141K views; says "From perps to agents and lending markets, the opportunities are out there for anyone who wants to build.")

> 190+ Stock Tokens, onchain, 24/7.
> 
> Nobody can watch all of them by hand.
> 
> That's the job for an agent. One you build yourself, test before it trades, and that tells you why it did what it did.
> 
> We're building it.

- Characters: 212 of 280
- Visual: Video: video/q1/zolva-q1-1920x1080.mp4 (20 s, voice over, music, captions; built by video/q1/build.sh)
- Status: **Ready**

### Q2. Quote @Cointelegraph on 24/7 stock token trading

Quote: https://x.com/Cointelegraph/status/2110128592877130012 (Oct 13, 35K views: most tokenized stock trading happens outside US market hours)

> The market for stock tokens never closes.
> 
> Your attention does.
> 
> An agent checks every hour, follows the rules you set, and writes down the reason for every trade. Even at 3am.

- Characters: 176 of 280
- Visual: None
- Status: **Ready**

### Q3. Quote @RobinhoodApp "Robinhood Agents are here" (backup)

Quote: https://x.com/RobinhoodApp/status/2105307330015592517 (Sep 30, 153K views)

> Agents are coming to trading.
> 
> The question nobody asks: when your agent buys, can it tell you why?
> 
> Ours will. Every decision, in plain words.

- Characters: 143 of 280
- Visual: None
- Status: **Ready**


## Phase 2: Teasers (1 to 2 days before launch)

### T1. The idea

> Describe a trading strategy in one sentence.
> 
> Watch it become rules.
> Watch 30 days of backtest.
> Watch it trade every hour, and explain itself.
> 
> Soon. 👁

- Characters: 151 of 280
- Visual: Blurred crop of the Studio prompt mode (screenshot, blurred)
- Status: **Ready**

### T2. The proof

> 16 public agents have traded stock tokens on Robinhood Chain since Oct 15.
> 
> 58 trades. 1,606 hourly decisions. Paper money, real onchain prices, every decision on record.
> 
> You'll be able to build your own. Very soon.

- Characters: 216 of 280
- Visual: Leaderboard screenshot with names blurred
- Status: **Fill: recount agents on the day**


## Phase 3: Launch day

### L1. Introducing Zolva + token (pin this)

> Introducing Zolva 👁
> 
> No code trading agents for stock tokens on Robinhood Chain. Build one in plain words. Backtest first. Trades hourly, explains every decision.
> 
> Paper trading live: zolvaagent.app
> 
> $TICKER is live on Pons
> CA: 0x0000000000000000000000000000000000000000

- Characters: 279 of 280
- Visual: Launch video (docs/x/video-plan.md)
- Status: **Blocked: ticker, contract address, launch video**

### L2. Dex paid (a few hours after launch)

> Dex profile is paid ✅
> 
> $TICKER on DEX Screener:
> dexscreener.com/robinhood/0x0000000000000000000000000000000000000000
> 
> Logo, links and socials are all set. Same CA as the pinned post.

- Characters: 137 of 280
- Visual: Screenshot of the DEX Screener page with the profile
- Status: **Blocked: do the Dex profile first, then paste the real link**

### L3. Dev supply burnt

> Dev supply: burnt 🔥
> 
> X% of $TICKER sent to the dead address. No team bag.
> 
> Check it yourself:
> robinhoodchain.blockscout.com/tx/0x0000
> 
> What we keep building is the product.

- Characters: 156 of 280
- Visual: Screenshot of the burn transaction on Blockscout
- Status: **Blocked: burn first, then paste the real tx and the real percentage**


## Phase 4: Product (one a day after launch)

Each post shows one real feature with a real screenshot. Numbers are from the live app on 2026-10-19; recheck before posting.

### P1. Build an agent in 3 steps

> Building an agent on Zolva:
> 
> 1. Pick up to 3 stock tokens
> 2. Pick a strategy: momentum, mean reversion, or your own rules
> 3. Set max per stock and a stop loss
> 
> The backtest updates while you move the sliders. No code.
> 
> zolvaagent.app/studio

- Characters: 242 of 280
- Visual: Studio screenshot
- Status: **Ready**

### P2. Prompt mode

> You don't have to know what a z score is.
> 
> Type: "buy sharp dips, sell when it recovers, or after 3 days".
> 
> Zolva's strategy writer turns it into rules you can read and edit, then backtests them on the last 30 days.

- Characters: 215 of 280
- Visual: Before/after: the prompt and the rules it made
- Status: **Ready**

### P3. Every decision explained

> Most bots give you a P&L. Zolva gives you the reason.
> 
> One of our agents on Oct 15:
> BUY NVDA. "Buy rule met: 24h RSI 25 below 30."
> 
> Every hour, every stock, every agent: buy, sell or hold, with the why.

- Characters: 202 of 280
- Visual: Agent page, decisions list
- Status: **Ready**

### P4. Backtest vs holding

> Every Zolva backtest answers one honest question:
> 
> Did the strategy beat just holding the same stocks?
> 
> If it didn't, you see that before you launch. Not after.

- Characters: 160 of 280
- Visual: Backtest card with the 'vs holding' line
- Status: **Ready**

### P5. Onchain prices

> Where do the prices come from?
> 
> Straight from each stock token's Uniswap pool on Robinhood Chain, read every hour.
> 
> No price API in the middle. What the agent sees is what the chain saw.

- Characters: 186 of 280
- Visual: Markets page screenshot
- Status: **Ready**

### P6. AI co-pilot

> New: an AI co-pilot for your agent.
> 
> When your rules want to trade, the AI approves or passes, with a reason. It can't change sizes or skip a stop loss.
> 
> 9 models. You set a spending limit and an end date. New accounts get $0.50 free.

- Characters: 234 of 280
- Visual: AI co-pilot picker + a decision with 'AI passed'
- Status: **Ready**

### P7. The co-pilot caught a bad signal

> We tested the AI co-pilot with a rule that claimed NVDA was up 3.2% in a day.
> 
> The real data said down 0.53%.
> 
> It passed: "the buy signal isn't supported."
> 
> That's the point of a second opinion. Cost of that review: $0.0002.

- Characters: 224 of 280
- Visual: Text card with the quote
- Status: **Ready**

### P8. Leaderboard, losses included

> The Zolva leaderboard ranks agents on live results since launch.
> 
> Next to every return: what holding the same stocks made, and the worst drop.
> 
> Losses stay on the board. Your agents are private until you publish them.

- Characters: 217 of 280
- Visual: Leaderboard screenshot
- Status: **Ready**

### P9. Guardrails

> Guardrails on every Zolva agent:
> 
> • Stop loss always runs
> • Max size per stock
> • AI can only approve or pass
> • AI spending capped by a limit you set
> • Missed hours are skipped, never traded late
> 
> Boring on purpose.

- Characters: 214 of 280
- Visual: None, or the settings panel
- Status: **Ready**

### P10. Agent launchpad (coming soon)

> Coming to Zolva: the agent launchpad.
> 
> Launch a token for your agent on Pons, from your own wallet. A contract splits the creator fees:
> 
> 70% to you
> 20% to your agent's AI
> 10% buys and burns the Zolva token
> 
> No admin key. The split is in the code.

- Characters: 246 of 280
- Visual: Landing page Agent launchpad card (animated, record a short clip)
- Status: **Ready (say Coming soon until the contracts are audited and live)**

### P11. What's next

> Paper trading is step one.
> 
> Next on Zolva:
> • Agent launchpad on Pons
> • Real money trading from your own wallet, within limits you set
> • Crypto markets next to stock tokens
> 
> Build an agent now and it has a track record by then.
> 
> zolvaagent.app

- Characters: 251 of 280
- Visual: Landing page 'What's next' section
- Status: **Ready (only promise what is on the roadmap)**
