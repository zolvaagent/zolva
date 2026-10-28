# Real money trading: research spike (2026-10-28)

Answers the four questions before building Phase 3 (plan in `mvp-plan.md` section 8b). The owner
decided on 2026-10-28 to start building without a legal review first; live access stays limited to
an allowlist of wallets (the owner's at first) until that review is done.

## 1. Custody: Privy signer with a policy

Privy lets the app add a **signer** to a user's **embedded wallet** (`addSigners` from the
`useSigners` hook; the signer is a key quorum created in the Privy dashboard). The server then asks
Privy to sign; the private key never leaves Privy's secure enclave, and a **policy** is checked
inside the enclave before anything is signed. A request that matches no rule is denied.

What a policy can check (EVM):
- method: `eth_signTransaction`, `eth_sendTransaction`, typed data, and others
- `ethereum_transaction`: `to`, `value`, `chain_id`
- `ethereum_calldata`: the decoded function and its arguments (needs the contract ABI), with `eq`,
  `in` (up to 100 values), `lt`/`gt` and more
- `system.current_unix_timestamp`, for time-limited permission
- stateful aggregations over a time window (only for `eth_signTransaction`)

**Limits found**
- Embedded wallets only. Users who log in with MetaMask or another external wallet cannot grant a
  signer, so live trading is for email and Google accounts (they all have a Privy wallet).
- Robinhood Chain (4663) is not named in Privy's chain list. Plan: use **`eth_signTransaction`**
  (Privy signs the raw transaction for any chain id) and broadcast it ourselves through Alchemy.
  This must be proven with one tiny real transaction before anything else is built.
- Privy pricing: free up to 499 monthly active users; every developer plan includes **50,000
  signatures and $1M of transaction volume a month**. Hourly agents trade a few times a month, so
  this is far from the limit.

Sources: Privy docs (signers overview, adding signers, policies overview, chains), privy.io/pricing,
read 2026-10-28.

## 2. Swap route: Uniswap SwapRouter02, not EquityRouter

Uniswap's official, audited contracts are deployed on Robinhood Chain (Uniswap developer docs):

| Contract | Address |
|---|---|
| SwapRouter02 | `0xcaf681a66d020601342297493863e78c959e5cb2` |
| UniversalRouter | `0x8876789976decbfcbbbe364623c63652db8c0904` |
| QuoterV2 | `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| UniswapV3Factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |

- **SwapRouter02 `exactInputSingle`** fits a policy well: Privy can decode it and check `tokenIn`,
  `tokenOut` and `recipient` (the user's own wallet), so the signer can only swap allowlisted tokens
  into the user's own wallet. Approvals are `approve(SwapRouter02, exact amount)` on allowlisted
  tokens only.
- **14 of 22 markets price from a v3 pool** and can use SwapRouter02 directly: AAPL, AMZN, BTC,
  CRCL, ETH, GLD, GME, GOOGL, MU, NVDA, QQQ, RDDT, SPCX, USO.
- **8 markets price from a v4 pool** (AMC, BABA, META, MSTR, PLTR, SPY, TSLA, TSM). They need the
  UniversalRouter, whose `execute(commands, inputs)` calldata is opaque to a policy (it can only pin
  the `to` address). Recommendation: the live beta trades the 14 v3 markets only.
- **EquityRouter is not usable as it is.** The contract at `0xa731…847a` has 4.3 KB of code, is not a
  proxy, and reverts on `venueCount()`, `owner()` and `v3Quoter()`, so it does not match the source in
  `equity-router/contracts`. It is also unaudited. It could come back later as a best-execution
  router after a fresh deploy and an audit.

## 3. Gas on Robinhood Chain

- Gas price 0.0201 gwei (2026-10-28). Eight real swaps in the WETH/USDG pool (aggregator and
  multi-hop routes, 0.4M to 1.2M gas) paid **$0.019 to $0.056** each. A single-pool
  `exactInputSingle` uses far less gas, so expect about a cent or two per trade, plus a one-off
  approval per token.
- That is negligible next to the 0.5% cost per trade the engine already assumes. The wallet needs a
  little ETH for gas: $1 covers dozens of trades. Privy gas sponsorship exists but is not needed.

## 4. Testnet

Robinhood Chain Testnet exists (chain id 46630, `rpc.testnet.chain.robinhood.com`), but its RPC did
not answer from this network and it is very unlikely to have the stock tokens or USDG pools. Plan:
test on mainnet with $5 to $10 from the owner's own wallet.

## Recommended build order

1. **Prove the signing path** (one tiny real transaction): Privy signer added to the owner's
   embedded wallet, a policy (chain 4663, SwapRouter02 and allowlisted tokens only, recipient = own
   wallet), `eth_signTransaction` from the server, broadcast via Alchemy. Needs the owner to enable
   signers in the Privy dashboard and to put about $10 of USDG and $1 of ETH in the wallet.
2. **Live executor** behind the existing `executions` table: quote with QuoterV2, check the price
   (Chainlink for ETH and BTC, the pool for stocks), max slippage, sign, broadcast, wait, record the
   real fill. Idempotent per agent, hour, token and side.
3. **Safety**: allowlisted wallets only, cap per agent and per day, global kill switch, auto pause
   after 2 failed transactions, v3 markets only.
4. **UI**: "Trade with real money" creates a live copy of a paper agent; balance check (USDG, ETH);
   grant the signer; limits; Stop button; Live badge; transactions with Blockscout links.
5. **Owner soak** with $5 to $10 for several days before anyone else.

Open questions for step 1: whether Privy's enclave signs for chain 4663 under a policy, and what the
user sees when `addSigners` runs.

## Step 1 result (2026-10-28): the signing path works

Owner's Privy embedded wallet `0x235c3ccea156dfbbc31ee37c07a7292c4506f628` (email login), funded with
11 USDG and 0.001 ETH. Signer `sulnagv1p05c3j4s1dcfg0x0` with policy `ski28975qoskumany3xe0u0k`
granted from `/dev/live-signer`.

- **Policy enforced:** Privy refused to sign a USDG `transfer` to a burn address:
  `400 policy_violation`. It was never broadcast.
- **Chain 4663 works with sign only:** Privy signed EIP-1559 transactions for chain 4663
  (`eth_signTransaction`), and Alchemy broadcast them.
- **Real swap:** $2 USDG to NVDA through SwapRouter02 `exactInputSingle` (pool fee 0.05%), minimum
  output quote minus 1%.
  - approve: [0xca1f…5da3](https://robinhoodchain.blockscout.com/tx/0xca1fd8cc1b3a229c45aa338b2405d77d721856e9ea07a86a3a1f85529e6b5da3), 58,294 gas, about $0.0028
  - swap: [0x50b4…6d15](https://robinhoodchain.blockscout.com/tx/0x50b4eab0be2bb11bb69d42128135f222cccb95436d9e8e9a98dfbdfb272a6d15), 164,321 gas, about $0.0079
  - received 0.009098124 NVDA, exactly the QuoterV2 quote (about $219.8 a share)
- **Cost:** about $0.011 of gas for the first trade in a token (approve plus swap), under a cent for
  later swaps with an approval in place. Privy signatures are inside the free plan.

What this proves: custody stays with the user, Zolva's server can trade only what the policy allows,
and the full path (quote, approve, sign, broadcast, confirm) runs on mainnet for about a cent.
Next: step 2, the live executor behind the `executions` table.

## Step 2: the live executor (built 2026-10-28)

- `lib/live/executor.ts`: one swap from start to finish, with no database: balances (token and an
  ETH gas reserve), a fresh QuoterV2 quote, a check against the reference price (Chainlink for ETH
  and BTC, otherwise the hourly close the decision used), an exact approval only when the
  allowance is short, `exactInputSingle` with the quote minus the max slippage as the minimum,
  Privy signs, our RPC broadcasts, and the real amount received is read from the token's Transfer
  log. Unit tests in `lib/live/executor.test.ts`.
- `lib/live/runner.ts` (called by `/api/cron/tick` after the paper agents):
  - does nothing unless `live_settings.enabled` is true and `PRIVY_AUTHORIZATION_KEY` is set
  - first finishes swaps a crashed tick left `submitted`, and cancels `pending` orders older than 30
    minutes
  - runs each live agent on the **newest hour only**; older hours are counted as skipped and never
    traded with real money
  - records the hour's decisions with `apply_agent_hour` (no paper trades), then one `executions` row
    per decision (unique per agent, hour, token and side) before sending anything, sells before buys
  - writes each confirmed fill atomically with `apply_live_fill` (execution, trade, position, cash);
    a sent swap that fails marks the order failed, and two failures in a row pause the agent
- Migration `live_executor`: `live_settings` (kill switch, off by default; $100 cap per live agent,
  $300 daily volume per wallet, 1% slippage, 2% price check), `live_wallets` (allowlist with the
  Privy wallet and policy), `live_agent_guard` (refuses wallets off the list and capital over the
  cap), `apply_live_fill`, and `executions.amount_in` / `amount_out`.
- Scripts: `npm run live:agent` (allowlist a wallet and create a live agent),
  `npm run live:smoke` (real $2 buy and sell through `executeSwap`).

Still to verify before switching the kill switch on in production:
1. The smoke test with real money (`npm run live:smoke -- <wallet> 2`).
2. That Privy signing works inside the Cloudflare Worker, not only in Node (`wrangler dev` with the
   kill switch on locally, or one live agent watched through its first trade).

### Smoke test result (2026-10-28, real money)

`npm run live:smoke -- 0x235c…f628 2`, through `executeSwap`, reference = NVDA hourly close $219.60:

- buy: 2 USDG for 0.009109048 NVDA at $219.56 (-0.02% vs the close), 187,323 gas, about $0.009
  ([0xd41c…82b1](https://robinhoodchain.blockscout.com/tx/0xd41ce45f51e5a5c358979e28fa9e2aacc48b39b688232926b1d55a8a773782b1))
- sell: all 0.018207172 NVDA (this buy plus step 1's) for 3.99379 USDG at $219.35 (-0.11%), 145,117
  gas, about $0.007 ([0xc75e…6fa5](https://robinhoodchain.blockscout.com/tx/0xc75ed76ba550aa8d15bc5d07bac94e416c52ff17430a6c29d9f128bd93446fa5))
- wallet back to 10.99379 USDG and no NVDA: $4 of round trips cost about $0.006 in pool fees and
  price, plus about $0.03 of gas in total since step 1.

Remaining check before the kill switch goes on in production: Privy signing inside the Worker.

### Worker check (2026-10-28): Privy signing runs inside the Cloudflare Worker

`POST /api/dev/live-sign-check` on the OpenNext build under `wrangler dev` (workerd), sign only:
the allowed approve was signed (173 bytes) and the USDG transfer was refused with `policy_violation`,
in 469 ms; nothing was broadcast, and a call without the cron secret got 401. The route answers 404
unless `LIVE_SIGN_CHECK=1` is set, which exists only locally for this check (removed again
afterwards, never a Worker secret).

All step 2 checks have passed. To go live for the owner: deploy (pushes `PRIVY_AUTHORIZATION_KEY`),
create one live agent with `npm run live:agent`, then set `live_settings.enabled = true`.

## Live for the owner (2026-10-28)

- Live agent `eda06900-f5a4-48e8-a465-0e9599d31fec` ("Live BTC ETH"): mean reversion on ETH + BTC, $10,
  max 50% per token, stop loss 10%, wallet `0x235c…f628`, private. Same settings as the paper agent
  "Lab · Crypto Mean Reversion", so the two can be compared hour by hour.
- Deployed with `PRIVY_AUTHORIZATION_KEY` as a Worker secret. A tick with the kill switch off returned
  `live: switched off` and all 24 paper agents ran normally.
- `live_settings.enabled = true` at about 10:3x UTC. The next tick ran the live agent on the 10:00 UTC
  hour: hold on both (BTC z 2.10, ETH z 1.80; it buys below z -2.5). No order yet.

To stop everything: `update live_settings set enabled = false where id = 1;` (takes effect at the next
tick). To stop the agent only: Pause on its page (logged in as the wallet's owner).
