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

## Option B in detail (chosen 2026-10-16, waiting for a yes before generating)

**Model:** [`xai/grok-imagine-video`](https://replicate.com/xai/grok-imagine-video), checked on
Replicate on 2026-10-16: **$0.05 per second of output video**, the same at 480p and 720p. Text or
image to video, 1 to 15 seconds, 720p at most, 16:9 among the aspect ratios.
The newer [`xai/grok-imagine-video-1.5`](https://replicate.com/xai/grok-imagine-video-1.5) costs
$0.08 per second and is a preview release that only does image to video; not needed here.

Both clips start from our own logo image (image to video), so the orb looks like the real brand
mark rather than a new character.

| Clip | Replaces | Input | Prompt | Length | Cost |
|---|---|---|---|---|---|
| 1. The watcher wakes | 0:00-0:07 (scenes 1 and 2) | `public/img/brand/zolva-mark.png` on a dark background | A glossy lavender orb with one eye floats in a dark room lit by walls of glowing stock tickers and candlestick charts; the eye opens, the pupil darts from screen to screen, the light reflects on the orb; slow push in, calm, cinematic, no text | 6 s, 720p, 16:9 | $0.30 |
| 2. 3am, still watching | 0:24-0:29, under the decision row | Same image | The same lavender orb hovers over a desk at night beside a window of a sleeping city, a single chart glows green, the eye follows the line and blinks once; gentle camera drift, soft purple light, no text | 6 s, 720p, 16:9 | $0.30 |

**Cost:** 2 clips x 6 s x $0.05 = **$0.60**. If a clip comes out wrong (extra eyes, warped
logo), one retry each brings it to **$1.20 at most**. I'd ask again before any third try.

Notes: 720p is the model's maximum, so the clips are upscaled in the 1080p cut; fine for short
atmospheric shots. The 1080 x 1350 feed version frames the 16:9 clips with the brand background
rather than cropping them.

## Generated clips (2026-10-16)

| File | Prediction | Result |
|---|---|---|
| `video/clips/clip1-grok-6s-720p.mp4` | xgzd14bewsrmy0d18fcbfxmrfr | Use. Orb in a room of charts, blinks at 3 s, charts reflect in the pupil |
| `video/clips/clip2-grok-6s-720p.mp4` | mchnxa6n8xrmr0d18fcrkf9dwr (retry) | Use. Night desk, the chart rises, the orb follows it and blinks. A faint dark logo shape sits on the monitor bezel: zoom about 10% in the edit so the bezel is cropped out |
| `video/clips/clip2-grok-6s-720p-try1-apple-logo.mp4` | hs3xfv0nmxrmy0d18fbsr722m8 | Rejected: the monitor was an iMac with a visible Apple logo |

Start frame for both: `video/clips/start-orb-1280x720.png` (logo on the brand dark background).
Spend: 3 clips x 6.04 s x $0.05 = about **$0.91** of the approved $1.20. No more generation without a new yes.

## What I need from you before recording

1. Option B chosen; say yes to the $0.60 (max $1.20) Grok cost above to generate the 2 clips.
2. The token ticker and contract address for the end card.
3. Voice over or captions only (captions only is fine for X).
