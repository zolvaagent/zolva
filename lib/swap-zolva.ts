/**
 * Swaps of $ZOLVA in the swap card. ZOLVA's main pool is the one Pons graduated it into: a plain
 * Uniswap v4 pool (native ETH / ZOLVA) on Uniswap's own PoolManager, with the PonsV2MemeHook,
 * which takes Pons' trading fee inside the swap. Zolva routes through Uniswap's official
 * Universal Router, so no Pons contract is called directly:
 *
 *   ETH (WETH) -> ZOLVA   WETH from the user (Permit2), unwrap, v4 swap, ZOLVA to the user
 *   USDG -> ZOLVA         USDG from the user (Permit2), v3 to WETH, unwrap, v4 swap, ZOLVA to the user
 *   ZOLVA -> ETH (WETH)   v4 swap (ZOLVA from the user via Permit2), wrap, WETH to the user
 *   ZOLVA -> USDG         v4 swap, wrap, v3 WETH -> USDG to the user
 *
 * One transaction per swap, with a deadline and a minimum out. Only the pool key below is ever
 * used (its hash is checked against the pool id in tests); ZOLVA's other v4 pools carry hook
 * fees of 8% to 84% and are never touched. Addresses are from Uniswap's v4 deployments page for
 * Robinhood Chain (developers.uniswap.org/docs/protocols/v4/deployments).
 *
 * Pure, so the server quote, the swap card and tests share it.
 */
import { encodeAbiParameters, encodeFunctionData, encodePacked, keccak256, type Hex } from "viem";

import { USDG } from "./live/contracts.ts";

export const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";
/** Universal Router 2.1.2 on Robinhood Chain. */
export const UNIVERSAL_ROUTER = "0x204faca1764b154221e35c0d20abb3c525710498";
export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
/** WETH9, the "ETH" market in Zolva's lists (SwapRouter02.WETH9()). */
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const NATIVE = "0x0000000000000000000000000000000000000000";

/** The Pons pool: read from the PoolManager's Initialize event for pool id ZOLVA_POOL_ID. */
export const ZOLVA_POOL_ID = "0x417e1f5361a5296f93a133142651e07d203f7a4ddecaa2de4460f1fb182e6d74";
export const ZOLVA_POOL_KEY = {
  currency0: NATIVE,
  currency1: "0x8e04549484d0612be8373a0263b11928a5f7681f",
  fee: 0,
  tickSpacing: 200,
  hooks: "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044",
} as const;
export const ZOLVA = ZOLVA_POOL_KEY.currency1;
/** Pons' fee per swap, taken by the hook (about 3% each way, seen in quotes on 2026-11-11). */
export const PONS_FEE_NOTE = "Includes Pons' trading fee (about 3%), taken by the pool's hook.";

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/** A v4 pool id: keccak256 of the ABI-encoded pool key. */
export function poolId(key: typeof ZOLVA_POOL_KEY): Hex {
  return keccak256(encodeAbiParameters([{ type: "tuple", components: POOL_KEY_COMPONENTS }], [key]));
}

/** Which side of a swap ZOLVA is on, and what the other side is (USDG or WETH). */
export type ZolvaLeg = { buy: boolean; other: "usdg" | "weth" };

/** The ZOLVA route for a pair, or null when the pair is not ZOLVA with USDG or ETH. */
export function zolvaLeg(tokenIn: Hex, tokenOut: Hex): ZolvaLeg | null {
  const other = (address: Hex) => (address === USDG ? "usdg" : address === WETH ? "weth" : null);
  if (tokenOut === ZOLVA && other(tokenIn)) return { buy: true, other: other(tokenIn)! };
  if (tokenIn === ZOLVA && other(tokenOut)) return { buy: false, other: other(tokenOut)! };
  return null;
}

// V4Quoter.quoteExactInputSingle (an eth_call; reverts internally and decodes the result).
export const V4_QUOTE_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const PERMIT2_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

/** How long a Permit2 approval of the router lasts: long enough to sign the swap, then it lapses. */
export const PERMIT2_TTL_SECONDS = 30 * 60;

/** Permit2.approve for exactly this swap's amount, expiring soon. */
export function permit2ApproveCall(token: Hex, amount: bigint, nowSeconds: number): Hex {
  return encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [token, UNIVERSAL_ROUTER, amount, nowSeconds + PERMIT2_TTL_SECONDS] });
}

// Universal Router commands and v4 router actions (Commands.sol, Actions.sol).
const CMD = { V3_SWAP_EXACT_IN: 0x00, PERMIT2_TRANSFER_FROM: 0x02, SWEEP: 0x04, WRAP_ETH: 0x0b, UNWRAP_WETH: 0x0c, V4_SWAP: 0x10 } as const;
const ACT = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE: 0x0b, TAKE: 0x0e, TAKE_ALL: 0x0f } as const;
/** Router recipients: the caller, or the router itself (ActionConstants.sol). */
const MSG_SENDER = "0x0000000000000000000000000000000000000001";
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
/** "Use the router's whole balance" (ActionConstants.CONTRACT_BALANCE). */
const CONTRACT_BALANCE = 1n << 255n;
/** "Use the open delta" for v4 amounts (ActionConstants.OPEN_DELTA). */
const OPEN_DELTA = 0n;

export const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const enc = encodeAbiParameters;
const v3Path = (from: Hex, fee: number, to: Hex) => encodePacked(["address", "uint24", "address"], [from, fee, to]);

/** The v4 swap on the Pons pool: settle what the router or user pays in, swap it all, take the out side. */
function v4Swap(options: { buy: boolean; amountIn: bigint; minOut: bigint; takeTo: "user" | "router" }): Hex {
  const inCurrency = options.buy ? NATIVE : ZOLVA;
  const outCurrency = options.buy ? ZOLVA : NATIVE;
  // Buying, the ETH is already in the router (unwrapped): settle the router's whole balance.
  // Selling, ZOLVA comes from the user through Permit2: settle exactly amountIn.
  const settle = enc([{ type: "address" }, { type: "uint256" }, { type: "bool" }], options.buy ? [inCurrency, CONTRACT_BALANCE, false] : [inCurrency, options.amountIn, true]);
  // amountIn OPEN_DELTA: swap the full credit the settle just created.
  const swap = enc(
    [{ type: "tuple", components: [{ name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS }, { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "hookData", type: "bytes" }] }],
    [{ poolKey: ZOLVA_POOL_KEY, zeroForOne: options.buy, amountIn: OPEN_DELTA, amountOutMinimum: options.minOut, hookData: "0x" }],
  );
  const take =
    options.takeTo === "user"
      ? enc([{ type: "address" }, { type: "uint256" }], [outCurrency, options.minOut])
      : enc([{ type: "address" }, { type: "address" }, { type: "uint256" }], [outCurrency, ADDRESS_THIS, OPEN_DELTA]);
  const actions = encodePacked(["uint8", "uint8", "uint8"], [ACT.SETTLE, ACT.SWAP_EXACT_IN_SINGLE, options.takeTo === "user" ? ACT.TAKE_ALL : ACT.TAKE]);
  return enc([{ type: "bytes" }, { type: "bytes[]" }], [actions, [settle, swap, take]]);
}

/**
 * The Universal Router call for a ZOLVA swap, paid out to the signer. `wethUsdgFee` is the fee
 * tier of the v3 WETH/USDG pool (the "ETH" market's pool); `minOut` is in the token received.
 */
export function zolvaSwapCall(options: { leg: ZolvaLeg; amountIn: bigint; minOut: bigint; wethUsdgFee: number; deadline: number }): Hex {
  const { leg, amountIn, minOut } = options;
  const commands: number[] = [];
  const inputs: Hex[] = [];
  const add = (command: number, input: Hex) => {
    commands.push(command);
    inputs.push(input);
  };
  if (leg.buy) {
    // The user's token comes into the router through Permit2 first. (A v3 swap with
    // payerIsUser reverted in eth_call simulations on Robinhood Chain on 2026-11-11, while
    // PERMIT2_TRANSFER_FROM and v3 swaps paid from the router's balance both went through.)
    add(CMD.PERMIT2_TRANSFER_FROM, enc([{ type: "address" }, { type: "address" }, { type: "uint160" }], [leg.other === "usdg" ? USDG : WETH, ADDRESS_THIS, amountIn]));
    if (leg.other === "usdg") {
      // USDG to WETH on the v3 pool, paid from and kept in the router.
      add(CMD.V3_SWAP_EXACT_IN, enc([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], [ADDRESS_THIS, CONTRACT_BALANCE, 0n, v3Path(USDG, options.wethUsdgFee, WETH), false]));
    }
    add(CMD.UNWRAP_WETH, enc([{ type: "address" }, { type: "uint256" }], [ADDRESS_THIS, 0n]));
    add(CMD.V4_SWAP, v4Swap({ buy: true, amountIn, minOut, takeTo: "user" }));
  } else {
    // ETH out of the Pons pool stays in the router, is wrapped, then sent on.
    add(CMD.V4_SWAP, v4Swap({ buy: false, amountIn, minOut: 0n, takeTo: "router" }));
    add(CMD.WRAP_ETH, enc([{ type: "address" }, { type: "uint256" }], [ADDRESS_THIS, CONTRACT_BALANCE]));
    if (leg.other === "usdg") {
      add(CMD.V3_SWAP_EXACT_IN, enc([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], [MSG_SENDER, CONTRACT_BALANCE, minOut, v3Path(WETH, options.wethUsdgFee, USDG), false]));
    } else {
      add(CMD.SWEEP, enc([{ type: "address" }, { type: "address" }, { type: "uint256" }], [WETH, MSG_SENDER, minOut]));
    }
  }
  const commandBytes = `0x${commands.map((command) => command.toString(16).padStart(2, "0")).join("")}` as Hex;
  return encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [commandBytes, inputs, BigInt(options.deadline)] });
}
