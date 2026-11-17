/**
 * PONS bonding curves on Robinhood Chain: find a token's curve and quote buys and sells, read only.
 * Ported from zolva-lab-agent src/curve.ts; interface and math from Rushr's open source code
 * (github.com/rushr-dev/platform packages/trade, verified to the wei against eth_simulateV1).
 * Constant product on virtual reserves; fee and creator tax come off the ETH side.
 */
import { parseAbi, type Address, type PublicClient } from "viem";

/** PONS launchpad factory: the only trusted source of a token's curve address. */
export const PONS_FACTORY: Address = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const CHAIN_ID = 4663;

export const ponsCurveAbi = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256)",
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function sellableTokens() view returns (uint256)",
]);
const factoryAbi = parseAbi(["function getLaunchedToken(address token) view returns (address token_, address curve)"]);
export const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);

const BPS = 10_000n;

export type CurveState = {
  curve: Address;
  quoteReserve: bigint;
  tokenReserve: bigint;
  feeBps: number;
  creatorTaxBps: number;
  graduated: boolean;
  realQuoteReserve: bigint;
  graduationThreshold: bigint;
  sellableTokens: bigint;
};

/** Tokens out for `quoteIn` wei (fee and tax off the input), capped at what the curve still sells. */
export function buyOut(quoteIn: bigint, c: CurveState): bigint {
  if (quoteIn <= 0n) return 0n;
  const net = quoteIn - (quoteIn * BigInt(c.feeBps)) / BPS - (quoteIn * BigInt(c.creatorTaxBps)) / BPS;
  const out = (c.tokenReserve * net) / (c.quoteReserve + net);
  return c.sellableTokens > 0n && out > c.sellableTokens ? c.sellableTokens : out;
}

/** Wei out for selling `tokensIn` (fee and tax off the output). */
export function sellOut(tokensIn: bigint, c: Pick<CurveState, "quoteReserve" | "tokenReserve" | "feeBps" | "creatorTaxBps">): bigint {
  if (tokensIn <= 0n) return 0n;
  const gross = (c.quoteReserve * tokensIn) / (c.tokenReserve + tokensIn);
  return gross - (gross * BigInt(c.feeBps)) / BPS - (gross * BigInt(c.creatorTaxBps)) / BPS;
}

/** The curve PONS reports for a token, or null when PONS never launched it. */
export async function curveOf(client: PublicClient, token: Address): Promise<Address | null> {
  const [, curve] = await client.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "getLaunchedToken", args: [token] });
  return /^0x0{40}$/i.test(curve) ? null : (curve.toLowerCase() as Address);
}

export async function readCurve(client: PublicClient, curve: Address): Promise<CurveState> {
  const call = <F extends "getReserves" | "feeBps" | "creatorTaxBps" | "graduated" | "realQuoteReserve" | "graduationThreshold" | "sellableTokens">(functionName: F) =>
    ({ address: curve, abi: ponsCurveAbi, functionName }) as const;
  const results = await client.multicall({
    contracts: [call("getReserves"), call("feeBps"), call("creatorTaxBps"), call("graduated"), call("realQuoteReserve"), call("graduationThreshold"), call("sellableTokens")],
    allowFailure: false,
    multicallAddress: MULTICALL3,
  });
  const [[quoteReserve, tokenReserve], feeBps, creatorTaxBps, graduated, realQuoteReserve, graduationThreshold, sellableTokens] = results as [
    readonly [bigint, bigint],
    bigint,
    bigint,
    boolean,
    bigint,
    bigint,
    bigint,
  ];
  return { curve, quoteReserve, tokenReserve, feeBps: Number(feeBps), creatorTaxBps: Number(creatorTaxBps), graduated, realQuoteReserve, graduationThreshold, sellableTokens };
}
