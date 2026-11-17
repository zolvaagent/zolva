/**
 * The Privy policy for a trench agent's wallet (ported from zolva-lab-agent scripts/policy.ts).
 * Zolva's signer acts on the user's agent wallet only under these rules, so even a leaked
 * authorization key could do no more than:
 * - curve buys and sells paid back to this wallet, at most `maxTxWei` of ETH per transaction;
 * - Uniswap's Universal Router (graduated tokens) and Permit2 approvals for it, same cap;
 * - token approvals with no ETH; Rushr's curve fee to its treasury only, with a tiny cap;
 * - withdrawals (ETH or tokens) only to the owner's own main wallet.
 * No message signing: the user signs Rushr's sign-in message themselves. Pure, so it is unit tested.
 */
import { PERMIT2, RUSHR_TREASURY, UNIVERSAL_ROUTER } from "./check-build.ts";
import { CHAIN_ID } from "./curve.ts";

const fn = (name: string, inputs: [string, string][], payable = false) => [
  { type: "function", name, stateMutability: payable ? "payable" : "nonpayable", inputs: inputs.map(([inputName, type]) => ({ name: inputName, type })), outputs: [] },
];
const CURVE_BUY = fn("buy", [["quoteIn", "uint256"], ["minTokensOut", "uint256"], ["recipient", "address"]], true);
const CURVE_SELL = fn("sell", [["tokensIn", "uint256"], ["minQuoteOut", "uint256"], ["recipient", "address"]]);
const ERC20_APPROVE = fn("approve", [["spender", "address"], ["amount", "uint256"]]);
const ERC20_TRANSFER = fn("transfer", [["to", "address"], ["amount", "uint256"]]);
const PERMIT2_APPROVE = fn("approve", [["token", "address"], ["spender", "address"], ["amount", "uint160"], ["expiration", "uint48"]]);

/** ETH per transaction for a budget: a bit over the largest single buy, in wei. */
export function maxTxWeiFor(maxPerTokenUsd: number, ethUsd: number): bigint {
  const eth = (maxPerTokenUsd * 1.5) / ethUsd;
  return BigInt(Math.ceil(eth * 1e6)) * 10n ** 12n;
}

/** Rushr's fee is 0.25% of a trade; this cap is ~2% of the largest buy. */
export function maxFeeWeiFor(maxTxWei: bigint): bigint {
  return maxTxWei / 50n;
}

export function trenchPolicyRules(wallet: string, owner: string, maxTxWei: bigint) {
  const self = wallet.toLowerCase();
  const home = owner.toLowerCase();
  const chain = { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: String(CHAIN_ID) };
  const capped = { field_source: "ethereum_transaction", field: "value", operator: "lte", value: maxTxWei.toString() };
  const noEth = { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" };
  const tx = (name: string, conditions: object[]) => ({ name, method: "eth_signTransaction", action: "ALLOW", conditions: [chain, ...conditions] });
  return [
    tx("PONS curve buy to this wallet", [capped, { field_source: "ethereum_calldata", field: "buy.recipient", abi: CURVE_BUY, operator: "eq", value: self }]),
    tx("PONS curve sell to this wallet", [noEth, { field_source: "ethereum_calldata", field: "sell.recipient", abi: CURVE_SELL, operator: "eq", value: self }]),
    tx("Uniswap Universal Router", [capped, { field_source: "ethereum_transaction", field: "to", operator: "eq", value: UNIVERSAL_ROUTER }]),
    tx("Permit2 approval for the Universal Router", [
      noEth,
      { field_source: "ethereum_transaction", field: "to", operator: "eq", value: PERMIT2 },
      { field_source: "ethereum_calldata", field: "approve.spender", abi: PERMIT2_APPROVE, operator: "eq", value: UNIVERSAL_ROUTER },
    ]),
    // Spender is the token's curve (one per token, not known in advance) or Permit2. Tokens only, never ETH.
    tx("Token approval", [noEth, { field_source: "ethereum_calldata", field: "approve.amount", abi: ERC20_APPROVE, operator: "gte", value: "0" }]),
    tx("Rushr curve fee", [
      { field_source: "ethereum_transaction", field: "to", operator: "eq", value: RUSHR_TREASURY },
      { field_source: "ethereum_transaction", field: "value", operator: "lte", value: maxFeeWeiFor(maxTxWei).toString() },
    ]),
    tx("Withdraw ETH to the owner", [{ field_source: "ethereum_transaction", field: "to", operator: "eq", value: home }]),
    tx("Withdraw tokens to the owner", [noEth, { field_source: "ethereum_calldata", field: "transfer.to", abi: ERC20_TRANSFER, operator: "eq", value: home }]),
  ];
}
