# Rushr (rushr.trade), 2026-11-16

The owner knows Rushr's dev directly, so we can ask them ourselves. Full research is in the Research session's note (rushr-notes.md in the shared notes folder). Nothing has been registered or sent.

## What Rushr is
- A social trading terminal on Robinhood Chain with calls, follows, and one leaderboard for both humans and agents.
  - The leaderboard ranks by 30-day USD PnL, counted from the swaps Rushr indexes for each wallet.
  - Season 0 runs until 2026-12-14.
- An agent is a member with its own wallet.
  - Rushr gives data and unsigned Uniswap transactions, and holds no funds.
  - Registration needs a SIWE signature from the agent's wallet.
- Limits:
  - memecoins only
  - real money only: no paper trading and no price history
  - no perps
- Fee is 0.25% in beta. There is a $RUSHR token, and the code is AGPL.

## Verdict
- **Not a place to test strategies.** It has no paper trading and no history.
- **It could give us a free, independent scoreboard for a Zolva real-money agent wallet.** We keep running the agent on Zolva; Rushr only reads its swaps.
  - Development would need to produce the SIWE signature from the live agent wallet.
  - The owner has to say yes first.
  - Each agent should use its own wallet.
- **Expect a low rank.** Our live agents trade $10 to $100 of BTC, ETH or stock tokens, not memecoins. The value is a third-party record, not the rank.

## Cautions
- Call it a listing, not a partnership, unless both sides agree to more.
- Do not tie ZOLVA to $RUSHR, for example in a joint token post or a token swap deal.
- Rushr's memecoin context is a weak brand fit, so keep any public mention to "our agent's record is also on Rushr".
- Registering puts a public identity on a real-money wallet. That is the owner's decision.

## DM to the dev (draft, the owner sends it)
> Hey! Checked out Rushr, the agent leaderboard is a cool idea. Zolva runs trading agents on Robinhood Chain (paper first, a few small real-money ones), and I'd like one of our live agent wallets on your board as an independent record.
>
> A few quick questions:
> 1. Do you index swaps that go through the normal Uniswap routers (SwapRouter02 / Universal Router), and do non-meme tokens count (stock tokens, BTC/ETH tokens)?
> 2. Can an agent link to an outside page (its Zolva agent page) or carry a badge like "runs on Zolva"?
> 3. Is there a read API for your token feed or safety checks that we could use, and what are the rate limits?
>
> If 1 is a yes, we'll register one wallet and see how it looks.

## Status
- 2026-11-16: The Rushr session (local_2c6f6ac0) now owns this track. It is writing DM v2 and the wallet plan. Outreach adds the DM text here only after the owner approves it; until then, v1 below is superseded.
- 2026-11-16: Research note received, DM drafted. Waiting for the owner to send the DM. After a yes on question 1, Development registers one live agent wallet (it needs the owner's yes).
