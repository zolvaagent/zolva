/**
 * Public posts on Rushr for trench agents (ported from zolva-lab-agent src/callouts.ts): one bullish
 * call a few minutes after each buy, stating the rule's facts, and a comment on that call for every
 * sell, losses included. Templated text, never written by a model. Pure, so the texts are tested.
 */

export const CALLOUT_MAX = 500;
export const COMMENT_MAX = 300;
/** Wait this long after a buy, so Rushr's indexer has the swap and links it as the call's entry. */
export const CALLOUT_DELAY_MS = 3 * 60_000;

/** Rushr refuses links; drop anything that looks like one. */
export function stripLinks(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w-]+\.(com|xyz|io|app|site|org|net|trade|ai|gg|fun)\b\S*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buyCallout(input: { symbol: string; usd: number; ruleFacts: string; narrative: string | null; presetName: string; stopPct: number }): string {
  const story = input.narrative ? ` Narrative: ${stripLinks(input.narrative).replace(/\.$/, "")}.` : "";
  // Cents under $10, so a $3.65 buy is not posted as $4.
  const amount = input.usd < 10 ? input.usd.toFixed(2) : input.usd.toFixed(0);
  const text =
    `Bullish $${input.symbol}: bought $${amount} by rule (${input.presetName}). ${stripLinks(input.ruleFacts).replace(/\.$/, "")}.${story} ` +
    `Stop -${input.stopPct}%. Runs on Zolva, not advice.`;
  return text.length <= CALLOUT_MAX ? text : `${text.slice(0, CALLOUT_MAX - 1)}…`;
}

export function sellComment(input: { sharePct: number; eth: number; pnlUsd: number; reason: string }): string {
  const pnl = `${input.pnlUsd >= 0 ? "+" : "-"}$${Math.abs(input.pnlUsd).toFixed(2)}`;
  const text = `Sold ${input.sharePct.toFixed(0)}% for ${input.eth.toFixed(5)} ETH (${pnl}). Why: ${stripLinks(input.reason)}.`;
  return text.length <= COMMENT_MAX ? text : `${text.slice(0, COMMENT_MAX - 1)}…`;
}
