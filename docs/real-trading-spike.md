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
