/**
 * Is this address a real Robinhood Stock Token? Every official one checked so far (all 20 on the
 * allowlist, 2026-11-17) is the same beacon proxy: identical bytecode that points at Robinhood's
 * beacon, and a name ending in "• Robinhood Token". Same-name clones (fake NVDA, the "ANT" tokens
 * before the Anthropic listing) have other bytecode.
 *
 * Necessary, not sufficient: anyone can deploy a proxy to the same beacon. So a new token also needs
 * its address confirmed from Robinhood's own announcement or asset list before it goes on the
 * allowlist (docs/tasks.md, $ANT). Pure, so it is unit tested; scripts/check-stock-token.mts reads the chain.
 */

/** Robinhood's Stock Token beacon; its address is baked into every official token's bytecode. */
export const ROBINHOOD_STOCK_BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";
/** A verified token to compare bytecode with (NVDA, allowlist). */
export const REFERENCE_STOCK_TOKEN = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
export const OFFICIAL_NAME_SUFFIX = " • Robinhood Token";

/** Uniswap pools the hourly price reader understands (lib/prices/onchain.ts), by GeckoTerminal dex id. */
export const PRICEABLE_DEXES: Record<string, "v3" | "v4"> = { "uniswap-v3-robinhood": "v3", "uniswap-v4-robinhood": "v4" };

export type TokenFacts = { code: string; referenceCode: string; name: string; decimals: number };

/** What fails the official Stock Token check; empty means it passes. */
export function officialTokenProblems(facts: TokenFacts): string[] {
  const problems: string[] = [];
  if (!facts.code || facts.code === "0x") problems.push("No contract at this address.");
  else if (facts.code.toLowerCase() !== facts.referenceCode.toLowerCase()) problems.push("Bytecode differs from the official Stock Token proxy: a clone or another kind of token.");
  if (!facts.code.toLowerCase().includes(ROBINHOOD_STOCK_BEACON.slice(2))) problems.push("Does not point at Robinhood's Stock Token beacon.");
  if (!facts.name.endsWith(OFFICIAL_NAME_SUFFIX)) problems.push(`Name "${facts.name}" does not end in "${OFFICIAL_NAME_SUFFIX}".`);
  if (facts.decimals !== 18) problems.push(`Has ${facts.decimals} decimals; official Stock Tokens have 18.`);
  return problems;
}

/** Uniswap orders a pool's tokens by address: the stock is token0 when its address is lower. */
export function stockIsToken0(stock: string, quote: string): boolean {
  return BigInt(stock) < BigInt(quote);
}
