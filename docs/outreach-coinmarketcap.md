# CoinMarketCap listing (draft, 2026-11-15)

**Form:** [New Listing] Add cryptoasset, https://support.coinmarketcap.com/hc/en-us/requests/new?ticket_form_id=360000493112
- The owner submits it. Nothing has been sent.
- Robinhood Chain is an option in the platform list (checked 2026-11-15).

**How CMC handles it** (from their CMCP page, read 2026-11-15):
- **Free tier.** CMC says turnaround is "highly variable" and not guaranteed, anywhere from days to months. They rank requests by industry interest.
- **CMC Priority (CMCP).** A paid fast track for things that don't affect rank (socials, logo, website). Prices are on their price page. Not needed now.
- **DEXScan.** CMC already tracks DEX tokens on chain automatically, so ZOLVA may already have a DEXScan page. This form asks for a full listing.
- **No paid middlemen.** CMC approves no outside listing service, so ignore anyone who offers one.

## Blockers before submitting
1. **Chat 1 is required** (Discord, Telegram and so on). Zolva has none (CoinGecko shows an empty Telegram too). Options:
   - (a) Make a small Telegram announcement channel. This is the simplest.
   - (b) Use the GitHub Discussions URL, if CMC accepts it.
2. **Contact email.** CMC trusts an email on the project's own domain more. We only have zolvaagent@gmail.com. Fine to submit, but a @zolvaagent.app address would look more official. It would need email routing on the domain, which is a Dev or owner task.
3. **Supply numbers must be re-read on the day.** The burn changes them. On 2026-11-13: total and circulating 958,493,582 (1B minus the 0x…dEaD balance); max 1,000,000,000.
4. **Optional but strong: supply API endpoints** that return only a number, for example `/api/supply/total` and `/api/supply/circulating`. These are a Dev task. CoinGecko can use them too.

## Telegram channel kit (owner creates it, 2026-11-15)
- **Type:** a public **Channel** (announcements only), not a group, so there is no spam or moderation load. A group can come later.
- **Name:** Zolva
- **Handle:** `zolva_agent` (matches X). Fallback: `zolvaagent`.
- **Photo:** the Zolva mark, https://zolvaagent.app/img/brand/zolva-mark.png
- **Description:**
  > No-code AI paper-trading agents for tokenized stocks and crypto on Robinhood Chain. Official announcements only. App: zolvaagent.app · X: @zolva_agent · Never DM-first, never asks for keys or funds.
- **First post (pin it):**
  > Welcome to the official Zolva channel.
  >
  > Zolva lets you build trading agents without code: pick tokenized stocks or crypto on Robinhood Chain, describe a strategy, backtest it, and let it paper trade every hour with a reason for every decision.
  >
  > • App: zolvaagent.app
  > • Docs: zolvaagent.app/docs
  > • X: x.com/zolva_agent
  > • ZOLVA on CoinGecko: coingecko.com/en/coins/zolva-agent
  >
  > Official contracts are only at zolvaagent.app/docs/contracts. We never DM first and never ask for keys or funds.
- **After it exists:**
  - Fill Chat 1 on the CMC form.
  - Send CoinGecko an "update info" request with the Telegram link (form on partner.coingecko.com).
  - Ask Dev to add the Telegram link to the site footer and /docs/verify's official accounts.

## Fields

| Field | Value |
|---|---|
| Email | zolvaagent@gmail.com (owner) |
| Subject | `Zolva Agent - ZOLVA - Add cryptoasset` |
| Relationship with the project | Team / founder (owner) |
| Project launch date | (owner confirms the token launch date on Pons) |
| Project name | Zolva Agent |
| Ticker | ZOLVA |
| Tags | AI, AI Agents, Trading Bots, Robinhood Chain Ecosystem, x402 (pick what the list offers) |
| One-liner | No-code AI paper-trading agents for tokenized stocks and crypto on Robinhood Chain. |
| Platform | Robinhood Chain |
| Logo link | https://coin-images.coingecko.com/coins/images/102180275/large/token-1000.png, or our own 200×200 PNG if CMC asks for that size |
| Website 1 | https://zolvaagent.app |
| Website 2 | https://zolvaagent.app/docs/token |
| Contract platform / address | Robinhood Chain / 0x8e04549484d0612be8373a0263b11928a5f7681f |
| Decimals | 18 |
| Block explorer | Blockscout token page for the address above |
| Source code | https://github.com/zolvaagent/zolva |
| Docs | https://zolvaagent.app/docs |
| Twitter | https://x.com/zolva_agent |
| Chat 1 | **Blocker, see above** |
| Circulating / total / max supply | Re-read on the day (see above) |
| Country of origin | (owner) |
| Team / backers | Independent team, no outside investors. Token was a 100% public fair launch on Pons (owner confirms) |
| Traction | Agents running every hour since 2026-10-15; listed on the official MCP Registry (1.1.0), Glama, CoinGecko, GeckoTerminal (verified), Hermes plugin catalog; ERC-8004 agent #25650 |
| Linkbacks to CMC / Ads / Boost | No |

**Detailed description** (reuse what CoinGecko accepted):
> Zolva is a platform for building, backtesting and running automated trading agents on Robinhood Chain, an Ethereum layer 2 for tokenized assets. Users set up a strategy with presets, rules or a plain-language prompt, backtest it on historical on-chain prices, and launch it as an agent that checks the market every hour. Agents trade tokenized US stocks plus ETH and BTC, start on paper money, and keep a public decision log of every trade, pass and skip. Developers can read agents and markets through a public API and an MCP server. ZOLVA is the platform's utility token.

## Filled 2026-11-16 (browser pane, waiting for the owner's Submit)
- Telegram: https://t.me/zolvaagent. Country: United States. Launch date: November 10, 2026 (first Pons pool on GeckoTerminal).
- Supply uses CoinGecko's figures (owner's choice): circulating 871,137,802, total 952,770,455, max 1,000,000,000.
- Tags: AI & Big Data, DApp, Platform. Platform: 300-Robinhood Chain. CMCP: No. Linkbacks: No. Ads, Boost, SRD and marketing consent left unticked.
- A stray Enter in the date field triggered one submit attempt. CMC rejected it because the T&C, Privacy and Proof fields were blank, so nothing was sent.
- Left for the owner: tick Terms & Conditions and Privacy Notice, review, then click Submit.
- 2026-11-16: the owner clicked Submit. Ticket number to come by email.

## Ticket 1475219 (2026-11-16)
- An auto email came from supportdesk@coinmarketcap.com (a real CMC domain, with an anti-phishing code). It offers the paid fast track, CMCP: USD 5,000, about 24 business hours after payment.
- **Not accepted.** Do not reply "agree" or click "Yes, I agree" / "I accept the terms": either one accepts the paid terms, and CMC then sends an invoice.
- Even if we paid, CMCP shows a price only when the asset trades on an exchange that already feeds CMC its API data. ZOLVA trades only in a Pons/Uniswap pool on Robinhood Chain, so the page would probably have no price.
- Without a reply, the request stays in the free queue. Check around 2026-11-30.
