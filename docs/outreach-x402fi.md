# Outreach: x402fi (x402 marketplace on Robinhood Chain)

Checked 2026-11-15. Inbound DM from @ensgianteth (Hector, founder) on 2026-11-15, still a message request. Draft only: the owner accepts the request, sends the reply and does the listing.

## The ask
"Would love to see Zolva Agents listed on our platform. Listing is free." Repo: github.com/RWA-ID/x402fi.

## What x402fi is
- Site https://x402fi.dev, X @x402fi_ (created 2026-11-09, 20 followers). Repo RWA-ID/x402fi: Apache-2.0, created 2026-11-09, 25 commits, all by Hector Morel, last push 2026-11-14, CI on. Next.js on Cloudflare (same stack as ours).
- Marketplace + gateway + public facilitator for x402 on Robinhood Chain (eip155:4663), paid in USDG. Also a Bazaar-style discovery feed (`/api/discovery/resources`), an MCP server (`/mcp`, read-only) and `/llms.txt`.
- Listing: a 5-step web wizard at x402fi.dev/sell/new, signed in with a wallet (SIWE). No PR, no JSON manifest.
- Two listing types:
  - **Proxied**: their gateway takes the payment (x402 v2) and forwards to the seller's API with a secret header. Not for us; we already charge ourselves.
  - **Native**: for sellers that already charge with x402. x402fi probes the seller's 402 once (unpaid), reads price, payTo and network, and buyers pay the seller directly (gateway answers 307 to our URL). x402fi takes no fee and never settles these.
- Free, 0% fee. Only optional paid thing: an x402 Identity / HoodFi payee name (ENS, from $3). Not needed.
- Founder @ensgianteth: ENS/HoodFi builder since 2020, 1,971 followers, also founder of @x402identity, @hoodfieth, @hoodpokercasino, @petidentity. Posted 2026-11-14 an open call for x402 services; replies from JazzCats about listing.

## Traction (live feed, 2026-11-15)
8 paid endpoints across 5 listings: their own demo and IPFS Pinning, HoodFi Names (founder's), AgentFuel Rug-Check, StockFi Trade (4 endpoints). Early and small, but real code and real settled payments (first paid pin 2026-11-13 on Blockscout).

## Red flags
- None in the ask: free, no keys, no payment, no token for Hector's x402fi.
- **Name collision**: @x402fi_xyz is an unrelated Solana project ("one API x402 gateway", $X4FI token on CyreneAI, Jan 2026). Not Hector's. Never tag or link @x402fi_xyz; the right account is @x402fi_.
- Sign-in is a wallet signature (SIWE). Use a fresh wallet or the payTo wallet only for signing; never paste a private key anywhere.
- Founder-run, one week old: listing is low cost, low reach.

## Fit
- Our premium API: x402 **v1**, `X-PAYMENT` header, network `robinhood` (also accepts `eip155:4663`), USDG. Endpoints `GET /api/x402/v1/scan` 0.02 USDG, `POST /api/x402/v1/backtest` 0.03 USDG (lib/x402/catalog.ts).
- x402fi's native parser (`src/lib/x402/native.ts`) accepts **v1 and v2** 402s and the `robinhood` network name, and checks the USDG address. So a **native listing reads our 402 as it is**. This is the difference from the x402 Bazaar (v2, Base/Solana only), which we skipped.
- Accurate? Yes, as long as it is a native listing: the price, payTo and network shown come from our own live 402.
- Caveat: their "Try it" button pays with x402 **v2** (`PAYMENT-SIGNATURE` header). Our server only reads `X-PAYMENT` with `x402Version: 1`, so Try it on our listing will most likely get a 402 back and no money moves. Agents that read our 402 (v1) pay fine. Ask Hector whether Try it handles v1 native listings, or Development adds v2 header support later (not in scope here).
- Zolva's MCP and free API are not x402; only list the two paid endpoints (maybe the free index as a free endpoint).

## Listing data (for the wizard, native)
- Service name: Zolva Premium API
- Category: Data / Analytics (closest available)
- Summary: Hourly market scan and strategy backtests for Robinhood Chain stock tokens, ETH and BTC, paid per call in USDG.
- Description: Zolva runs paper-trading agents on Robinhood Chain. The premium API sells its analysis per call over x402 (v1, exact, USDG): a scan of every Zolva market at the latest hourly close, and a backtest that replays a strategy with Zolva's engine against holding. Paper trading only; results are hypothetical.
- Endpoints (native, URL as is):
  1. `GET https://zolvaagent.app/api/x402/v1/scan`: 0.02 USDG. Every Zolva market at the latest hourly close: change, 48 hour z-score, 14 hour RSI and trend, deepest dip first.
  2. `POST https://zolvaagent.app/api/x402/v1/backtest`: 0.03 USDG. Replay a strategy on up to 3 Zolva markets over the last 1 to 30 days with Zolva's engine, compared with holding. Probe body (shape from /docs/premium-api): `{"strategy":"mean_reversion","markets":["ETH"],"days":7}`.
  3. Optional free: `GET https://zolvaagent.app/api/x402/v1` (index of endpoints and prices).
- Payout wallet: X402_PAY_TO (read from the 402; the wizard fills it).
- Payee name: skip (optional, costs money).
- Logo: https://zolvaagent.app/img/brand/zolva-mark.png (PNG, 200 OK; they reject SVG)
- Website: https://zolvaagent.app · Docs: https://zolvaagent.app/docs/premium-api · X: @zolva_agent
- ERC-8004: agent #25650 on Robinhood Chain (if the wizard asks; their Priors badge reads the payout wallet).

## DM reply draft (owner sends)
> Hey Hector, thanks for reaching out! Happy to list. Our premium API already speaks x402 on Robinhood Chain (v1, USDG, paid straight to our wallet), so we'll add it as a native listing through the wizard: scan and backtest at zolvaagent.app/api/x402/v1. One question: does Try it work with v1 native endpoints? We read X-PAYMENT, not PAYMENT-SIGNATURE yet.

Shorter version:
> Hey Hector, thanks! Happy to list. Our premium API is already x402 v1 on Robinhood Chain in USDG, so we'll add it as a native listing via the wizard. Quick q: does Try it handle v1 native endpoints?

## Hector's answer (2026-11-15, 1:55 PM)
- v1 native endpoints work; price and payout come straight from our 402. Confirmed in the repo: commit 2026-11-15 06:36Z "Native listings: x402 v1 endpoints labelled as v1 (X-PAYMENT)" on the card, feed, MCP and llms.txt.
- Try it does not run on native listings yet; the page shows the live price and a ready curl instead, and buyers pay us directly. So the Try it caveat above no longer matters.
- He asked to be pinged once it is up, and to report any friction in the wizard.

## Wizard walkthrough (owner, x402fi.dev/sell/new)
Checked against their code (`src/app/api/listings/route.ts`) and our live 402 on 2026-11-15.
1. Sign in with a wallet (SIWE signature, no gas). Any wallet works; it does not have to be the payTo. A fresh or low-value wallet is fine. Never paste a private key.
2. Choose **native** (the endpoint already charges with x402).
3. Base URL: `https://zolvaagent.app/api/x402/v1`
4. Endpoint 1: `GET /scan`. Endpoint 2: `POST /backtest` with example body `{"strategy":"mean_reversion","markets":["ETH"],"days":7}`. The body must be valid: `{}` gets a 400 instead of a 402 and the probe fails.
5. Payout wallet comes from our 402: `0x30428cf923a77917e351aad7417adc7f98a99c5d` (X402_PAY_TO). Both endpoints pay the same wallet, so one listing is fine.
6. Name, summary, description, logo, website, X: from "Listing data" above.
7. Name step: skip (payee names are optional and cost money).
8. Publish, then check the listing page and https://x402fi.dev/api/discovery/resources.

Ping draft after it is live:
> It's up: x402fi.dev/market/<slug>. Wizard was smooth. Thanks Hector!

(If anything was clunky, swap "Wizard was smooth" for the friction.)

## Status
- [x] Owner accepted the DM request and sent the reply (2026-11-15); Hector confirmed v1 native works
- [x] LISTED 2026-11-15: https://x402fi.dev/market/zolva-premium-api (native, no payee name). Checked the same day: both endpoints in the discovery feed as x402 v1, network robinhood, USDG, payTo 0x3042…9c5d, $0.02 scan / $0.03 backtest, settlement "direct"; page shows the v1 X-PAYMENT curl, logo, @zolva_agent and site links. Feed items reuse the listing summary as the per-endpoint 402 description (cosmetic; the page shows each endpoint's own text)
- [ ] Owner pings Hector with the listing link + heads-up that we post about it later (draft: "It's live: x402fi.dev/market/zolva-premium-api 🎉 Wizard was smooth. One small thing: the example JSON body showed [object Object] when an autofill tool filled it, fine once pasted as text. We'll post about the listing on X later today, will tag @x402fi_.")
- [x] DM sent; Hector replied 2026-11-15 10:33 PM: checked end to end, "first v1 native listing on x402Fi", fixed their card label ("from $0.02"), will repost if we tag @x402fi_
- **First outside x402 payment** 2026-11-15: Hector paid GET /scan as a buyer, 200 in ~5 s. Tx 0x84c91d21eadd6b00a7faf74aa2c212b81225c0388205fd769ca6b66551c77b63, checked on chain (RPC receipt, status 1, block 115049656): USDG 20000 (= 0.02) from 0x5f11a482…165b to our payTo 0x30428cf9…9c5d. /stats now reads "453 of them our own tests" (so 1 outside)
- Hector suggests a payee name from the x402fi Dashboard ("Add a payee name"); costs money (HoodFi $3 USDG or x402 Identity on Ethereum), owner's call
- [ ] P69 scheduled by the owner (not posted yet as of 2026-11-15)
- [ ] P72 follow-up (first outside payment, reply/quote under P69) drafted in docs/x/tweets-2.md; owner posts (docs/x/tweets-2.md, video video/demo/zolva-x402fi-1920x1080.mp4)
- Later (optional, costs money): payee name zolva.hoodfi.eth ($3 USDG) for the Verified payee badge, from the x402fi dashboard
- Wizard note: the example JSON body field must be typed or pasted as text; an automated fill turned it into `[object Object]` and the probe failed until it was fixed
- [ ] After listing: check it shows in https://x402fi.dev/api/discovery/resources with our price and payTo
