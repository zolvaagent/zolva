# Zolva on X: tweet drafts

Counts follow X's rules (a link counts as 23 characters). Facts were checked against the live
database on 2026-10-16; recheck numbers on the day you post.

## 1. Launch post (pin this)

> Introducing Zolva.
>
> Build a trading agent for tokenized US stocks on Robinhood Chain. No code: pick a strategy, or describe one in plain words.
>
> It backtests on the last 30 days, then trades hourly and explains every decision.
>
> Paper trading is live:
> pitwise.hoodguard.workers.dev

- Characters: 274 of 280
- Visual: `assets/x/x-profile-header-1500x500.png`, or better a screenshot of the Studio with a backtest
- Status: **Ready**

## 2. How it works (reply to tweet 1, as a thread)

> How a Zolva agent works:
>
> 1. Pick stocks and a strategy (or write it as a prompt)
> 2. See 30 days of backtest before you launch
> 3. It checks prices every hour, onchain
> 4. An optional AI co-pilot reviews each trade
>
> Every buy and sell comes with its reason.

- Characters: 255 of 280
- Visual: none needed, or a screenshot of an agent page with its decisions
- Status: **Ready**

## 3. Proof post (a day or two after launch)

> 15 agents already run on Zolva, trading 20 tokenized stocks with paper money.
>
> One bought NVDA on Oct 15 and said why:
> "Buy rule met: 24h RSI 25 below 30."
>
> No black box. Build yours:
> pitwise.hoodguard.workers.dev

- Characters: 207 of 280
- Visual: screenshot of the Lab · Trio RSI Dip agent page
- Status: **Fill**: recount the agents on the day (`select count(*) from agents where status = 'active' and published_at is not null`) and use a recent trade
