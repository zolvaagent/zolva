import { dayAt, percent, signedUsd } from "@/lib/format";

export type ShareTextInput = {
  name: string;
  symbols: string[];
  createdAt: number;
  returnPct: number;
  pnlUsd: number;
  holdReturnPct: number;
  url: string;
};

/** "BTC, ETH and SOL" (perp suffix dropped); more than three markets become "its 5 markets". */
function marketsPhrase(symbols: string[]): string {
  const names = [...new Set(symbols.map((symbol) => symbol.replace(/-PERP$/, "")))];
  if (names.length > 3) return `its ${names.length} markets`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The prefilled post for "Post on X". It never overclaims: the comparison with holding is only
 * mentioned when the agent is ahead, and a loss is said plainly.
 */
export function agentShareText(input: ShareTextInput): string {
  const since = dayAt(input.createdAt);
  const result = `${signedUsd(input.pnlUsd)} (${percent(input.returnPct)})`;
  let line: string;
  let footer = "Every decision is public 👇";
  if (input.pnlUsd < 0) {
    line = `AI agent "${input.name}" is down ${result.replace("−", "")} since ${since}.`;
    footer = "Every decision, good and bad, is public 👇";
  } else if (input.returnPct > input.holdReturnPct) {
    const hold = Math.abs(input.holdReturnPct).toFixed(1);
    line = `AI agent "${input.name}" made ${result} since ${since}, while just holding ${marketsPhrase(input.symbols)} ${input.holdReturnPct < 0 ? "lost" : "made"} ${hold}%.`;
  } else {
    line = `AI agent "${input.name}" made ${result} since ${since}.`;
    footer = "Every decision, good and bad, is public 👇";
  }
  return `${line}\n\n${footer}\n${input.url}`;
}
