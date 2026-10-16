# Zolva launch video: plan (nothing generated yet)

For the launch post (L1 in `tweets.md`). Approve an option before anything is recorded or
generated; paid clips need a separate yes with the exact cost.

## Goal and message

- **Goal:** in the first 3 seconds, show that this is an agent you build yourself for stock
  tokens; by the end, the viewer knows the three steps and where to go.
- **One message:** "Describe it, test it, watch it trade, and read why."
- **Length:** 35 seconds. Muted by default, so every line is burned in as a caption.
- **Formats:** 1920 x 1080 (main) and 1080 x 1350 (feed), 30 fps, MP4 H.264, under 512 MB.

## Script (about 85 words, on screen as captions, optional voice over)

1. Stock tokens trade 24/7. You can't watch them all.
2. Zolva builds you an agent that can.
3. Describe a strategy in plain words.
4. It becomes rules you can read and edit.
5. See 30 days of backtest before it trades a dollar, and whether it beat just holding.
6. Launch it. It checks onchain prices every hour.
7. Every buy and sell comes with its reason.
8. Paper trading is live. Zolva. Trading agents that show their work.

## Scenes

| Time | Scene | Source | Cost |
|---|---|---|---|
| 0:00-0:04 | Grid of stock token tickers ticking, caption 1 | Markets page screen recording, zoomed | Free |
| 0:04-0:07 | Watcher orb logo opens its eye, caption 2 | Logo PNG animated in Remotion | Free |
| 0:07-0:13 | Typing a prompt in Studio prompt mode, "Generate rules" | Screen recording | Free (one strategy writer call, under $0.001 of our own credits) |
| 0:13-0:18 | Rules appear in the rule builder | Screen recording | Free |
| 0:18-0:24 | Backtest chart draws, "vs holding" line highlights | Screen recording | Free |
| 0:24-0:29 | Agent page: decision row "BUY NVDA. Buy rule met: 24h RSI 25 below 30." | Screen recording of a real agent | Free |
| 0:29-0:35 | End card: orb, "Paper trading is live", app link, $TICKER | Remotion | Free |

## Options

| Option | What | Cost | Notes |
|---|---|---|---|
| **A. Product only (recommended)** | Screen recordings of the live app plus motion graphics and captions, built in Remotion or ffmpeg | $0 | Honest, fast, matches "show their work"; needs Remotion (an npm install, ask first) or ffmpeg |
| B. Product plus 2 cinematic shots | Option A plus two short generated clips (for example the orb watching a wall of charts) for 0:00-0:07 | A Grok video model on Replicate; check its exact slug and price per clip before asking | Only if A feels too plain after a first cut |
| C. Mostly generated | Generated scenes with the UI composited in | Highest | Not recommended: looks like every other AI launch and shows less of the product |

## What I need from you before recording

1. Pick an option (A recommended).
2. The token ticker and contract address for the end card.
3. Voice over or captions only (captions only is fine for X).
