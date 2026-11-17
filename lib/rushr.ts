import "server-only";

/**
 * Read-only Rushr (rushr.trade) ranks for the Trenches page: Zolva agents listed on Rushr and the
 * Zolva Lab reference agent. Public routes only, no API key, nothing signed. Plan:
 * docs/rushr-integration-plan.md.
 *
 * Answers are memoised per Worker isolate for a minute, so page views don't turn into one Rushr
 * call each. Every read fails soft (null) and the page says the data is unavailable.
 */

const API = "https://api.rushr.trade";
const CACHE_MS = 60_000;
// Rushr's rank answer can take ~5.5 s when its own 30 s cache is cold.
const TIMEOUT_MS = 9_000;

/** The Zolva Lab agent on Rushr (registered 2026-11-17, owner approved). */
export const LAB_HANDLE = "zolva_lab";

export type RushrRank = { season: { name: string; endsAt: string } | null; rank: number | null; agentRank: number | null; pnl: number | null; unranked: string | null };

const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(path: string): Promise<unknown | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (!response.ok) return hit?.value ?? null;
    const value: unknown = await response.json();
    cache.set(path, { at: Date.now(), value });
    return value;
  } catch {
    // A slow or failed read shows the last good answer from this isolate, if there is one.
    return hit?.value ?? null;
  }
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
type Loose = Record<string, unknown>;

function parseRank(body: unknown): RushrRank | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Loose;
  const season = raw.season as Loose | null | undefined;
  return {
    season: season && str(season.name) && str(season.endsAt) ? { name: String(season.name), endsAt: String(season.endsAt) } : null,
    rank: num(raw.rank),
    agentRank: num(raw.agentRank),
    pnl: num(raw.pnl),
    unranked: str(raw.unranked),
  };
}

/** Rushr ranks for a few handles (each memoised a minute); unknown or failed ones are null. */
export async function getRanks(handles: string[]): Promise<Map<string, RushrRank | null>> {
  const unique = [...new Set(handles)].slice(0, 20);
  const answers = await Promise.all(unique.map(async (handle) => [handle, parseRank(await getJson(`/v1/members/${encodeURIComponent(handle)}/rank`))] as const));
  return new Map(answers);
}
