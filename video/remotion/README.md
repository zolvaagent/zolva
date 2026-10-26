# Zolva videos (Remotion)

Marketing videos as code, kept apart from the app (own `package.json`, run `npm install` here).
Style follows the website: warm white canvas, lavender accent, dark panels, Inter; motion is
eased, never shaken.

| Composition | What | Output |
|---|---|---|
| `Q1` (`src/Q1.tsx`) | 25 s quote video for the @RobinhoodCrypto "100 days" post, music only | `../q1/zolva-q1-v2-1920x1080.mp4` |
| `CryptoLive` (`src/CryptoLive.tsx`) | 21 s "Crypto markets are live" video for tweet P12, music only (same Lyria track) | `../crypto-live/zolva-crypto-live-1920x1080.mp4` |
| `RecordCard` (`src/RecordCard.tsx`) | 1600x900 image for tweet U1 (11 days on the record), render with `npx remotion still src/index.ts RecordCard` | `../../assets/x/record-11-days-1600x900.png` |

## Render

```bash
npm run render:q1
npm run render:crypto-live
```

Then normalise the audio for X (about -16 LUFS):

```bash
ffmpeg -y -i out/zolva-q1-1920x1080.mp4 -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k -movflags +faststart ../q1/zolva-q1-v2-1920x1080.mp4
```

Preview and tweak live with `npm run studio`.

## Assets in `public/`

- `music-lyria.wav`: Google Lyria 2 on Replicate, 2026-10-19 (prediction xvpyzeapnnrmw0d1a9x96j5v8r)
- `orb-look-left.png`, `orb-look-right.png`, `orb-blink.png`: gpt-image-2 medium on Replicate from the
  brand orb, white background cut out with `scripts/cutout-icons.py`
- `orb.png`: copy of `public/img/brand/zolva-mark.png`
- `icon-currency-btc.svg`, `icon-currency-eth.svg`: Phosphor Icons 2.1.1 (fill), the same icons the app's crypto avatars use

Facts in Q1: 190+ stock tokens (from the quoted post); backtest numbers from the Studio on
2026-10-19 (NVDA, mean reversion, last 30 days: agent -0.7%, holding -2.7%); the GME decision is
real (2026-10-18 16:00 UTC, AI co-pilot passed). The chart lines are illustrative and end at
those totals.

Facts in CryptoLive (all 2026-10-24): ETH and BTC 7 day lines are stored hourly closes (every 3rd hour);
the pool vs Chainlink numbers are a real read at one block (ETH $2,367.08 vs $2,370.08); the NVDA + ETH
backtest (momentum, last 30 days: agent -4.8%, holding -8.3%) is from the Studio.
