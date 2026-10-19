# Zolva videos (Remotion)

Marketing videos as code, kept apart from the app (own `package.json`, run `npm install` here).
Style follows the website: warm white canvas, lavender accent, dark panels, Inter; motion is
eased, never shaken.

| Composition | What | Output |
|---|---|---|
| `Q1` (`src/Q1.tsx`) | 25 s quote video for the @RobinhoodCrypto "100 days" post, music only | `../q1/zolva-q1-v2-1920x1080.mp4` |

## Render

```bash
npm run render:q1
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

Facts in Q1: 190+ stock tokens (from the quoted post); backtest numbers from the Studio on
2026-10-19 (NVDA, mean reversion, last 30 days: agent -0.7%, holding -2.7%); the GME decision is
real (2026-10-18 16:00 UTC, AI co-pilot passed). The chart lines are illustrative and end at
those totals.
