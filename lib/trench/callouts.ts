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

/** The exit in a call: the stop for exit v2, the ladder and trail for the moonbag (which has no stop). */
export function calloutExitNote(exit: { style: string; stopPct: number; trailingPct: number; ladder: readonly { gainPct: number; sellShareOfEntry: number }[] }): string {
  if (exit.style !== "moonbag") return `Stop -${exit.stopPct}%.`;
  const first = exit.ladder[0];
  return first ? `No stop: ${Math.round(first.sellShareOfEntry * 100)}% out at +${first.gainPct}%, the rest trails ${exit.trailingPct}%.` : `No stop, trails ${exit.trailingPct}%.`;
}

export function buyCallout(input: { symbol: string; usd: number; ruleFacts: string; narrative: string | null; presetName: string; exitNote: string }): string {
  const story = input.narrative ? ` Narrative: ${stripLinks(input.narrative).replace(/\.$/, "")}.` : "";
  // Cents under $10, so a $3.65 buy is not posted as $4.
  const amount = input.usd < 10 ? input.usd.toFixed(2) : input.usd.toFixed(0);
  const text =
    `Bullish $${input.symbol}: bought $${amount} by rule (${input.presetName}). ${stripLinks(input.ruleFacts).replace(/\.$/, "")}.${story} ` +
    `${input.exitNote} Runs on Zolva, not advice.`;
  return text.length <= CALLOUT_MAX ? text : `${text.slice(0, CALLOUT_MAX - 1)}…`;
}

export function sellComment(input: { sharePct: number; eth: number; pnlUsd: number; reason: string }): string {
  const pnl = `${input.pnlUsd >= 0 ? "+" : "-"}$${Math.abs(input.pnlUsd).toFixed(2)}`;
  const text = `Sold ${input.sharePct.toFixed(0)}% for ${input.eth.toFixed(5)} ETH (${pnl}). Why: ${stripLinks(input.reason)}.`;
  return text.length <= COMMENT_MAX ? text : `${text.slice(0, COMMENT_MAX - 1)}…`;
}

// ---------------------------------------------------------------- call-only agent (holds nothing)

/** Words a call-only pitch never uses: it describes the project, it does not sell it. */
const HYPE = /\b(moon\w*|100x|\d+x|gem|pump\w*|ape|lfg|guarantee\w*|huge|massive|insane|explod\w*|rocket\w*|next big|wagmi|alpha|early)\b/i;

/**
 * Cleans the model's one-sentence pitch, or returns null when it can't be posted as written: any
 * $TICKER (the call names only its own token, in the template), hype words, prices or targets.
 */
export function cleanPitch(pitch: string): string | null {
  const text = stripLinks(pitch).replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if (text.length < 15 || text.length > 180) return null;
  if (/\$\s?[A-Za-z0-9]/.test(text) || /\d\s?(%|usd\b|k\b|m\b|mcap)/i.test(text)) return null;
  if (HYPE.test(text) || /[!\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) return null;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The call-only agent's call (owner 2026-11-23): facts and the project's own pitch; nothing about
 * exits or holdings, no targets. Example: "Zolva Lab signal on $Intercept. The pitch: a risk
 * firewall for trading agents, with a live dashboard already up. Bonding 63%, dev 0.9%, DEX paid
 * 11 min after launch, CA posted by their own X. Not advice."
 */
export function callOnlyCallout(input: { symbol: string; pitch: string; bonding: number | null; devPct: number | null; dexPaidMinutes: number | null; caPostedByOwnX: boolean }): string {
  const facts = [
    input.bonding === null ? null : `Bonding ${(input.bonding * 100).toFixed(0)}%`,
    input.devPct === null ? null : `dev ${input.devPct < 10 ? input.devPct.toFixed(1) : input.devPct.toFixed(0)}%`,
    input.dexPaidMinutes === null ? null : `DEX paid ${Math.round(input.dexPaidMinutes)} min after launch`,
    input.caPostedByOwnX ? "CA posted by their own X" : null,
  ].filter(Boolean);
  const head = `Zolva Lab signal on $${input.symbol}.`;
  const tail = `${facts.length > 0 ? ` ${facts.join(", ")}.` : ""} Not advice.`;
  // Only the pitch is ever shortened, never the facts or "Not advice".
  const room = CALLOUT_MAX - head.length - tail.length - " The pitch: .".length;
  const pitch = input.pitch.length <= room ? input.pitch : `${input.pitch.slice(0, room - 1)}…`;
  return `${head} The pitch: ${pitch}.${tail}`;
}

const EXIT_PHRASES: Record<string, string> = {
  stop: "stop loss hit",
  lock: "profit locked",
  red: "turned red",
  flow: "sellers took over",
  graduation: "graduated",
  time: "time limit reached",
  trail: "trailing stop hit",
  ladder: "profit taken",
  halt: "signal stopped",
};

const signedPct = (pct: number) => `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(0)}%`;

/** The reply under a call-only call when its paper position exits, e.g. "Exit signal: trailing stop hit, +18% since call (peak +31%)." */
export function exitSignalComment(input: { exitKind: string; sharePct: number; sinceCallPct: number; peakPct: number }): string {
  const what = input.sharePct >= 99.9 ? "Exit signal" : `Partial exit signal (${input.sharePct.toFixed(0)}%)`;
  const peak = input.peakPct > input.sinceCallPct + 0.5 ? ` (peak ${signedPct(input.peakPct)})` : "";
  return `${what}: ${EXIT_PHRASES[input.exitKind] ?? "exit rule hit"}, ${signedPct(input.sinceCallPct)} since call${peak}.`;
}
