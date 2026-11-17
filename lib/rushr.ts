import "server-only";

/**
 * Read-only Rushr (rushr.trade) data for the Trenches page: the Zolva Lab agent's public profile,
 * rank, PnL and callouts. Public routes only, no API key, nothing signed. Plan:
 * docs/rushr-integration-plan.md (release 0).
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
export const LAB_WALLET = "0x9dec887dc8dd6bed2b7d8d0ce4db2471c174292c";
export const RUSHR_PROFILE_URL = `https://app.rushr.trade/u/${LAB_HANDLE}`;

export type RushrRank = { season: { name: string; endsAt: string } | null; rank: number | null; agentRank: number | null; pnl: number | null; unranked: string | null };

export type RushrPnl = {
  realizedUsd: number;
  unrealizedUsd: number;
  volumeUsd: number;
  trades: number;
  tokensTraded: number;
  winRate: number | null;
  lastTradeAt: string | null;
  positions: { token: string; symbol: string; boughtUsd: number; soldUsd: number; valueUsd: number; pnlUsd: number; pnlPct: number | null; open: boolean; firstTradeAt: string | null }[];
};

export type RushrCallout = { id: string; createdAt: string; symbol: string; token: string; body: string; sinceEntryPct: number | null; comments: number };

export type LabRecord = { rank: RushrRank | null; pnl: RushrPnl | null; callouts: RushrCallout[] | null; fetchedAt: number };

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

function parsePnl(body: unknown): RushrPnl | null {
  const raw = body as { summary?: Loose; positions?: Loose[] } | null;
  if (!raw?.summary) return null;
  const summary = raw.summary;
  return {
    realizedUsd: num(summary.realized_usd) ?? 0,
    unrealizedUsd: num(summary.unrealized_usd) ?? 0,
    volumeUsd: num(summary.volume_usd) ?? 0,
    trades: num(summary.trades) ?? 0,
    tokensTraded: num(summary.tokens_traded) ?? 0,
    winRate: num(summary.win_rate),
    lastTradeAt: str(summary.last_trade_at),
    positions: (raw.positions ?? [])
      .map((position) => ({
        token: str(position.token) ?? "",
        symbol: str(position.symbol) ?? "?",
        boughtUsd: num(position.bought_usd) ?? 0,
        soldUsd: num(position.sold_usd) ?? 0,
        valueUsd: num(position.value_usd) ?? 0,
        pnlUsd: num(position.total_pnl_usd) ?? 0,
        pnlPct: num(position.pnl_pct),
        open: (num(position.held_ui) ?? 0) > 0,
        firstTradeAt: str(position.first_trade_at),
      }))
      .filter((position) => position.token)
      .sort((a, b) => (b.firstTradeAt ?? "").localeCompare(a.firstTradeAt ?? "")),
  };
}

function parseCallouts(body: unknown): RushrCallout[] | null {
  const items = (body as { items?: Loose[] } | null)?.items;
  if (!Array.isArray(items)) return null;
  return items.flatMap((item) => {
    const token = item.token as Loose | undefined;
    const result = item.result as Loose | undefined;
    const id = str(item.id);
    const createdAt = str(item.createdAt);
    if (!id || !createdAt || !token) return [];
    return [{ id, createdAt, symbol: str(token.symbol) ?? "?", token: str(token.address) ?? "", body: str(item.body) ?? "", sinceEntryPct: num(result?.sinceEntryPct), comments: num(item.comments) ?? 0 }];
  });
}

/** The Lab agent's public record on Rushr; parts that fail to load are null. */
export async function getLabRecord(): Promise<LabRecord> {
  const [rank, pnl, callouts] = await Promise.all([
    getJson(`/v1/members/${LAB_HANDLE}/rank`),
    getJson(`/wallets/${LAB_WALLET}/pnl`),
    getJson(`/v1/members/${LAB_HANDLE}/callouts?limit=10`),
  ]);
  return { rank: parseRank(rank), pnl: parsePnl(pnl), callouts: parseCallouts(callouts), fetchedAt: Date.now() };
}
