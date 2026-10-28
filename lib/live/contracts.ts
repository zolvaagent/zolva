/**
 * Real money trading (Phase 3, owner-only spike): the contracts a live agent
 * may touch on Robinhood Chain, and the Privy policy that limits its signer to
 * them. Research in docs/real-trading-spike.md.
 *
 * Kept free of Next.js and server-only imports so scripts can share it.
 */

export const ROBINHOOD_CHAIN_ID = 4663;

/** Uniswap's official deployments on Robinhood Chain (Uniswap developer docs, 2026-10-28). */
export const SWAP_ROUTER_02 = "0xcaf681a66d020601342297493863e78c959e5cb2";
export const QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

/** ERC-20 approve, the only token call the signer may make. */
export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** SwapRouter02 exactInputSingle (no deadline field, unlike the original SwapRouter). */
export const EXACT_INPUT_SINGLE_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** QuoterV2 quoteExactInputSingle, called with eth_call to price a swap before signing it. */
export const QUOTE_EXACT_INPUT_SINGLE_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/**
 * Privy policy rules for one live wallet. Everything not allowed here is
 * denied by Privy's enclave before it signs:
 * 1. approve(SwapRouter02, amount) on USDG or an allowlisted token, chain 4663 only.
 * 2. SwapRouter02.exactInputSingle between allowlisted tokens, paid out to the
 *    wallet itself, with no ETH attached, chain 4663 only.
 * `tokens` are lowercase addresses (USDG plus the tradable markets).
 */
export function livePolicyRules(wallet: string, tokens: string[]) {
  const chain = { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: String(ROBINHOOD_CHAIN_ID) } as const;
  return [
    {
      name: "Approve the swap router on allowlisted tokens",
      method: "eth_signTransaction",
      action: "ALLOW",
      conditions: [
        chain,
        { field_source: "ethereum_transaction", field: "to", operator: "in", value: tokens },
        { field_source: "ethereum_calldata", field: "approve.spender", abi: ERC20_APPROVE_ABI, operator: "eq", value: SWAP_ROUTER_02 },
      ],
    },
    {
      name: "Swap allowlisted tokens into this wallet",
      method: "eth_signTransaction",
      action: "ALLOW",
      conditions: [
        chain,
        { field_source: "ethereum_transaction", field: "to", operator: "eq", value: SWAP_ROUTER_02 },
        { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
        { field_source: "ethereum_calldata", field: "exactInputSingle.params.tokenIn", abi: EXACT_INPUT_SINGLE_ABI, operator: "in", value: tokens },
        { field_source: "ethereum_calldata", field: "exactInputSingle.params.tokenOut", abi: EXACT_INPUT_SINGLE_ABI, operator: "in", value: tokens },
        { field_source: "ethereum_calldata", field: "exactInputSingle.params.recipient", abi: EXACT_INPUT_SINGLE_ABI, operator: "eq", value: wallet.toLowerCase() },
      ],
    },
  ];
}
