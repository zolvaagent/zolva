/**
 * Market session of a Stock Token from Harmonic's session oracle (harmonicagent.solutions,
 * free public read, no key). It tells whether the issuer is quoting the stock normally or
 * trading is halted or paused, which Zolva's own pool price cannot show.
 *
 * Used in two places: the live executor holds a real-money order while the token is halted
 * or paused, and the market page shows the status. Both fail open: when Harmonic cannot be
 * read, Zolva behaves exactly as it did without it. Tokens are looked up by address, never
 * by symbol (same-name clones exist).
 */

export const HARMONIC_URL = "https://harmonicagent.solutions";

/** Harmonic's verdicts, most serious first (its own `rules.order`). */
export const VERDICTS = ["halted", "paused", "unknown", "held", "stale", "open"] as const;
export type SessionVerdict = (typeof VERDICTS)[number];

export type TokenSession = {
  verdict: SessionVerdict;
  /** Harmonic's own explanation, e.g. "the issuer's feed says trading is halted". */
  reason: string;
  /** When Harmonic's reading was taken (ISO). */
  at: string;
};

/** Only an explicit stop by the issuer holds an order; stale or unknown quotes do not (weekends). */
export function blocksTrading(verdict: SessionVerdict): boolean {
  return verdict === "halted" || verdict === "paused";
}

/** Parses one `/api/keeper/session/<address>` answer; null when it is not for this token or unreadable. */
export function parseSession(body: unknown, address: string): TokenSession | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (data.ok !== true || typeof data.token !== "string" || data.token.toLowerCase() !== address.toLowerCase()) return null;
  if (!VERDICTS.includes(data.verdict as SessionVerdict)) return null;
  return {
    verdict: data.verdict as SessionVerdict,
    reason: typeof data.reason === "string" ? data.reason.slice(0, 300) : "",
    at: typeof data.at === "string" ? data.at : new Date().toISOString(),
  };
}

/** Reads one token's session. Never throws: null means "not known", and callers carry on without it. */
export async function fetchSession(address: string, { timeoutMs = 4000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<TokenSession | null> {
  try {
    const response = await fetchImpl(`${HARMONIC_URL}/api/keeper/session/${address.toLowerCase()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return parseSession(await response.json(), address);
  } catch {
    return null;
  }
}

/** Short label for the market page. */
export function sessionLabel(verdict: SessionVerdict): string {
  switch (verdict) {
    case "open":
      return "Trading normally";
    case "halted":
      return "Trading halted";
    case "paused":
      return "Paused by the issuer";
    default:
      return "No fresh issuer quote";
  }
}
