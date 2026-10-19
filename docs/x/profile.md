# Zolva on X: profile kit

Prepared 2026-10-16. The account does not exist yet; the owner creates it and posts. Nothing here
is posted, followed or liked on their behalf.

## Handle (check availability on X when signing up)

| Handle | Note |
|---|---|
| **@zolvaagent** (recommended) | Matches the GitHub account `zolvaagent`, so the brand reads the same everywhere |
| @zolva_ai | Short, but "AI" oversells: the agents run on rules, AI is an optional co-pilot |
| @usezolva | Common product pattern, works if the others are taken |
| @zolvaxyz | Only if zolva.xyz is bought later |

Display name: **Zolva**

## Bio (160 characters maximum)

| # | Text | Chars | Leads with |
|---|---|---|---|
| **1 (recommended)** | No code trading agents for tokenized US stocks on Robinhood Chain. Every decision explained. Paper trading live, real money soon. | 129 | What it is, then the honesty angle, then status |
| 2 | Build a trading agent in plain words. It trades tokenized US stocks on Robinhood Chain and shows its work. Paper trading now. | 125 | The prompt mode |
| 3 | Trading agents that show their work. Tokenized US stocks on Robinhood Chain, no code needed. Paper trading live. | 112 | The slogan (skip if the banner already says it) |
| 4 | Your own stock trading agent on Robinhood Chain: build it without code, backtest it on 30 days, watch every decision. Paper money for now. | 138 | The full flow |

The banner already carries "Trading agents that show their work", so bio 1 avoids repeating it.

## Other fields

| Field | Value |
|---|---|
| Location | Empty (or "Robinhood Chain") |
| Website | https://pitwise.hoodguard.workers.dev (switch when a real domain is bought) |
| Profile photo | `assets/x/x-avatar-400-ink.png` (dark) or `assets/x/x-avatar-400-light.png`; the orb has padding for X's circle crop |
| Header | [x-profile-header-1500x500-v2.png](../../assets/x/x-profile-header-1500x500-v2.png) (recommended, dark) or the first light version [x-profile-header-1500x500.png](../../assets/x/x-profile-header-1500x500.png) |
| Pinned post | Tweet 1 in `tweets.md` |
| Birthday, personal links | Leave empty; keep the account anonymous like the GitHub one |

## Banner

**Version 2 (recommended, 2026-10-19):** [x-profile-header-1500x500-v2.png](../../assets/x/x-profile-header-1500x500-v2.png),
from [banner-v2.html](../../assets/x/banner-v2.html). Dark, like the site's "What's next" panel.
Left: "Trading agents that show their work." Right: a real moment from 2026-10-18 16:00 UTC, when an
agent's rules wanted to buy GME and the AI co-pilot (DeepSeek V4.1 Flash) passed: "Price is not
making a clear higher-low bounce ... looks like falling knife" (shortened on the banner). The text
was checked against a simulated desktop avatar circle (about 333 px at this scale, bottom left).
Re-render with the command below, using `banner-v2.html` and the `-v2.png` file name.

**Version 1:** `assets/x/x-profile-header-1500x500.png`, rendered free from `assets/x/banner.html` (site colours,
Inter). Content sits centre right because the avatar covers the bottom left on desktop and phones
crop about 40 px per side. The decision card is a real trade: Lab · Trio RSI Dip bought NVDA on
2026-10-15 11:00 UTC.

To re-render after editing the HTML (Git Bash, from `assets/x`):

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=5000 --window-size=1500,500 --screenshot="$(pwd -W)\\x-profile-header-1500x500.png" "file:///$(pwd -W)/banner.html"
```

## Slogan options

| Slogan | Note |
|---|---|
| **Trading agents that show their work** (in use) | The honesty angle: every decision has a reason |
| Build it, backtest it, watch it trade | The flow in three verbs |
| Your strategy, running every hour | Plain and concrete |
| No black box trading | Sharp, but defines us by what we're not |

## Wording rules

- Always say **paper trading** or **paper money** until real money exists.
- Numbers only from the live database, with their date (agent counts change).
- No price predictions, no "make money" claims, no financial advice.
- Do not tag Robinhood or imply a partnership; "on Robinhood Chain" is fine.
- Not for US persons: never target US audiences in copy.
