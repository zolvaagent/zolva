/**
 * Every field of a Rushr trade build checked against what this trade may do, before anything is
 * signed (ported from zolva-lab-agent src/executor.ts). Throws on anything unexpected. The agent
 * wallet's Privy policy (lib/trench/policy.ts) is the second line of defence. Pure.
 */
import { decodeFunctionData, parseAbi, type Hex } from "viem";

import { CHAIN_ID } from "./curve.ts";

/** Rushr's fee treasury (a Safe): the only address a curve follow-up fee may go to. */
export const RUSHR_TREASURY = "0x2ae062c61a757b66d3039154a6e965aa48cd75f3";
/** Uniswap Universal Router v2.1.2 on Robinhood Chain (graduated tokens). */
export const UNIVERSAL_ROUTER = "0x204faca1764b154221e35c0d20abb3c525710498";
export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";

export type BuiltTx = { chainId: number; to: string; data: string; value: string; gas?: string };
export type Build = {
  tx: BuiltTx;
  approvals: { kind: string; token: string; spender: string; tx: BuiltTx }[];
  followUp: { kind: "rushr_fee"; amount: string; tx: BuiltTx } | null;
  quote: { amountIn: string; amountOut: string; minAmountOut: string; pool: { venue: string; curve?: string }; fee: { feeAmount: string } };
  simulation?: { ok: boolean; error: string | null };
};

export class RefusedBuild extends Error {}

const approveAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const permit2Abi = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]);

export function checkBuild(b: Build, expect: { side: "buy" | "sell"; token: string; curve: string | null; amountIn: bigint }): void {
  const lower = (value: string) => value.toLowerCase();
  const fail = (why: string): never => {
    throw new RefusedBuild(`refused Rushr build: ${why}`);
  };
  const allowedTargets = [expect.curve, UNIVERSAL_ROUTER].filter((value): value is string => Boolean(value)).map(lower);
  if (b.tx.chainId !== CHAIN_ID) fail(`chain ${b.tx.chainId}`);
  if (!allowedTargets.includes(lower(b.tx.to))) fail(`tx goes to ${b.tx.to}`);
  if (!b.simulation) fail("no simulation");
  if (b.simulation && !b.simulation.ok) fail(`simulation failed: ${b.simulation.error}`);
  if (expect.side === "buy") {
    if (BigInt(b.tx.value) !== expect.amountIn) fail(`buy value ${b.tx.value}, expected ${expect.amountIn}`);
    if (b.approvals.length) fail("a buy with approvals");
  } else {
    if (BigInt(b.tx.value) !== 0n) fail("a sell that sends ETH");
    for (const approval of b.approvals) {
      if (approval.tx.chainId !== CHAIN_ID || BigInt(approval.tx.value) !== 0n) fail("approval chain or value");
      if (lower(approval.tx.to) === lower(expect.token)) {
        const call = decodeFunctionData({ abi: approveAbi, data: approval.tx.data as Hex });
        const spender = lower(call.args[0]);
        if (![...allowedTargets, PERMIT2].includes(spender)) fail(`approval to ${spender}`);
      } else if (lower(approval.tx.to) === PERMIT2) {
        const call = decodeFunctionData({ abi: permit2Abi, data: approval.tx.data as Hex });
        if (lower(call.args[0]) !== lower(expect.token) || lower(call.args[1]) !== UNIVERSAL_ROUTER) fail("Permit2 approval for another token or spender");
      } else fail(`approval sent to ${approval.tx.to}`);
    }
  }
  if (b.followUp) {
    const fee = b.followUp.tx;
    if (lower(fee.to) !== RUSHR_TREASURY || (fee.data && fee.data !== "0x")) fail("fee transfer to an unknown address or with data");
    // Rushr's fee is 0.25% (0.5% after beta); refuse anything above 1% of the trade.
    const notional = expect.side === "buy" ? expect.amountIn : BigInt(b.quote.amountOut);
    if (BigInt(fee.value) * 100n > notional) fail(`fee ${fee.value} is over 1% of ${notional}`);
  }
}
