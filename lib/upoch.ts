/**
 * Upoch (upoch.tech) checkpoints a few public paper agents on Robinhood Chain every hour by reading
 * our public API. Their "Upoch Verified" badge says whether the mirror is healthy (workflow active,
 * a checkpoint in the last 7 days, a guardian). It does not check our results.
 *
 * We show the small badge on the mirrored agents only (owner's pick, 2026-11-17). Visitors never
 * load it from upoch.tech: /api/upoch-badge/[n] fetches it server side, checks it, and caches it.
 * Notes: docs/outreach-upoch.md.
 */

export const UPOCH_ORIGIN = "https://upoch.tech";

/** Zolva agent id → Upoch's mirror number. Add a row only when Upoch mirrors a new agent. */
const UPOCH_MIRRORS: Record<string, number> = {
  "be4b8f92-031d-4ae1-a5e9-c12583ff1d20": 6, // Chip Breakout
  "b4cca798-68a1-4064-b750-92f6e1e06bb0": 7, // Twin · RSI Dip + AI
  "8482ba4c-a4ad-47b5-b6d2-222ecdf5cc5f": 8, // Lab · Perps Deep Dip Alts
};

const MIRROR_NUMBERS = new Set(Object.values(UPOCH_MIRRORS));

export type UpochMirror = { number: number; pageUrl: string; badgePath: string };

export function upochMirror(agentId: string): UpochMirror | null {
  const number = UPOCH_MIRRORS[agentId];
  if (number === undefined) return null;
  return { number, pageUrl: `${UPOCH_ORIGIN}/verified/${number}`, badgePath: `/api/upoch-badge/${number}` };
}

/** Only mirror numbers we listed may be proxied, so the route can't be used to fetch anything else. */
export function isUpochMirrorNumber(value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  const number = Number(value);
  return MIRROR_NUMBERS.has(number) ? number : null;
}

const MAX_BADGE_BYTES = 32_000;

/**
 * Accepts the badge only if it looks like the small plain SVG Upoch serves: an <svg> root, small,
 * and with no script, event handler, foreign content or outside reference. The route also serves it
 * with a locked-down CSP, so this is a second guard, not the only one.
 */
export function isSafeBadgeSvg(body: string): boolean {
  if (body.length === 0 || body.length > MAX_BADGE_BYTES) return false;
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(body)) return false;
  if (/<script|<foreignObject|<iframe|<object|<embed|\son[a-z]+\s*=|javascript:/i.test(body)) return false;
  // Only in-document references (#id) and data URIs; nothing that loads from another host.
  if (/(?:href|src)\s*=\s*["'](?!#|data:)/i.test(body)) return false;
  return true;
}

export async function fetchUpochBadge(number: number, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<string | null> {
  try {
    const response = await fetchImpl(`${UPOCH_ORIGIN}/verified/${number}/badge.svg`, {
      headers: { accept: "image/svg+xml" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("image/svg+xml")) return null;
    const body = await response.text();
    return isSafeBadgeSvg(body) ? body : null;
  } catch {
    return null;
  }
}
