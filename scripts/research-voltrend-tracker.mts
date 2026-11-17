/**
 * Research only (read-only, never writes to the database): weekly tracker for the "Lab · <coin> Vol Trend" paper
 * agents (long only and L+S, SOL XRP NEAR ZEC, seeded 2026-11-14; plus the "L+S OI" A/B agents seeded 2026-11-16,
 * which have no backtest expectations: their yardstick is the L+S agent next to them). Two questions per agent:
 *
 *   1. Is the live engine doing what the engine says? Replays the agent with the real engine (`simulate`)
 *      on the same cleaned closes and funding the runner loads (candle_closes + buildCloseSeries), from the
 *      agent's first run, and compares every trade (hour, side) and the latest equity with the database.
 *   2. Is the agent inside what the backtest promised (docs/perps-research.md, rounds 2 and 3, and the
 *      engine check on b660110)? Flags a worst drop above the backtest's or above the 30% pass limit, and a
 *      trade count far from the backtest's yearly pace.
 *
 *   ENGINE_ROOT=<checkout with the deployed engine> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-voltrend-tracker.mts
 *
 * ENGINE_ROOT defaults to this checkout; point it at a checkout of the deployed commit when this one is behind.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ENGINE_ROOT = resolve(process.env.ENGINE_ROOT ?? new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const { simulate, maxDrawdown } = await import(pathToFileURL(resolve(ENGINE_ROOT, "lib/engine/engine.ts")).href);
const { buildCloseSeries, HOUR_SECONDS, OUTLIER_WINDOW } = await import(pathToFileURL(resolve(ENGINE_ROOT, "lib/engine/series.ts")).href);

/** Hours of history before the first run: the 1,200 hour average and 720 hour volatility need it. */
const WARMUP_HOURS = 1300;

/**
 * Backtest expectations per agent (engine on Binance data, 2020-10 to 2026-11; drop = worst drop over the
 * whole window, entries = signal entries per year). Long only from round 2 / the engine check, L+S from
 * the engine check of variant C (docs/perps-research.md).
 */
const EXPECTED: Record<string, { drop: number; entriesPerYear: number }> = {
  "SOL Vol Trend": { drop: 20, entriesPerYear: 80 / 5.1 },
  "XRP Vol Trend": { drop: 21, entriesPerYear: 72 / 5.1 },
  "NEAR Vol Trend": { drop: 30, entriesPerYear: 92 / 5.1 },
  "ZEC Vol Trend": { drop: 26, entriesPerYear: 93 / 5.1 },
  "SOL Vol Trend L+S": { drop: 21, entriesPerYear: 175 / 5.1 },
  "XRP Vol Trend L+S": { drop: 29.8, entriesPerYear: 177 / 5.1 },
  "NEAR Vol Trend L+S": { drop: 22, entriesPerYear: 194 / 5.1 },
  "ZEC Vol Trend L+S": { drop: 25, entriesPerYear: 211 / 5.1 },
  // Spot paper twins of the planned real-money agents (research-preset-years.mts, spot cost 0.5%, one market).
  "BTC Vol Trend": { drop: 19, entriesPerYear: 46 / 5.1 },
  "ETH Vol Trend": { drop: 17, entriesPerYear: 59 / 5.1 },
};
const DROP_LIMIT = 30;

/** The agents.params columns this script reads (numbers may come back as strings). */
type StoredParams = {
  rules?: unknown;
  max_position_pct?: number | string;
  stop_loss_pct?: number | string;
  venue?: string;
  leverage?: number | string;
  sizing?: { targetPct: number | string; hours: number | string };
};
type Agent = { id: string; name: string; strategy: string; params: StoredParams; token_addresses: string[]; start_capital: number; created_at: string };

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

/** Same mapping as lib/agents/plan.ts agentParams. */
function agentParams(agent: Agent) {
  const p = agent.params;
  return {
    strategy: agent.strategy,
    rules: p.rules,
    maxPositionPct: Number(p.max_position_pct),
    stopLossPct: Number(p.stop_loss_pct),
    venue: p.venue,
    ...(p.leverage ? { leverage: Number(p.leverage) } : {}),
    ...(p.sizing ? { sizing: { kind: "volTarget", targetPct: Number(p.sizing.targetPct), hours: Number(p.sizing.hours) } } : {}),
  };
}

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const pct = (value: number, digits = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;

async function main() {
  const vars = readDevVars();
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const select = "id, name, strategy, params, token_addresses, start_capital, created_at";
  const lab = await db.from("agents").select(select).like("name", "Lab · % Vol Trend%").order("name");
  const twins = await db.from("agents").select(select).like("name", "Paper % Vol Trend%").order("name");
  if (lab.error || twins.error) throw new Error((lab.error ?? twins.error)!.message);
  const agents = [...(lab.data ?? []), ...(twins.data ?? [])];
  const { data: latestRow } = await db.from("candles").select("ts").order("ts", { ascending: false }).limit(1).single();
  const latest = Date.parse(latestRow!.ts) / 1000;
  console.log(`Vol Trend tracker, latest hour ${new Date(latest * 1000).toISOString().slice(0, 13)}:00Z, engine from ${ENGINE_ROOT}\n`);

  const firstCreated = Math.min(...(agents as Agent[]).map((a) => Date.parse(a.created_at) / 1000));
  const startTs = Math.floor(firstCreated / HOUR_SECONDS) * HOUR_SECONDS - WARMUP_HOURS * HOUR_SECONDS;
  const { data: raw, error: rawError } = await db.rpc("candle_closes", { p_from: new Date((startTs - OUTLIER_WINDOW * HOUR_SECONDS) * 1000).toISOString() });
  if (rawError) throw new Error(rawError.message);
  const byAddress = new Map<string, { symbol: string; candles: [number, number, number | null][] }>((raw as { address: string; symbol: string; candles: [number, number, number | null][] }[]).map((t) => [t.address, t]));
  const hours: number[] = [];
  for (let ts = startTs; ts <= latest; ts += HOUR_SECONDS) hours.push(ts);

  const rows: string[][] = [];
  for (const agent of agents as Agent[]) {
    const label = agent.name.replace("Lab · ", "").replace("Paper ", "");
    const address = agent.token_addresses[0];
    const token = byAddress.get(address)!;
    const candles = token.candles.map(([time, close]) => ({ time: Number(time), close: Number(close) }));
    const closes = buildCloseSeries(candles, startTs, latest).closes;
    const fundingByTime = new Map(token.candles.map(([time, , rate]) => [Number(time), rate == null ? null : Number(rate)]));
    const funding = hours.map((ts) => fundingByTime.get(ts) ?? null);
    // Open interest (stored hourly from 2026-11-16 for the OI A/B agents); missing hours stay null like the runner.
    const oiRows = await all<{ ts: string; open_interest: number | null }>((from, to) =>
      db.from("candles").select("ts, open_interest").eq("token_address", address).gte("ts", new Date(startTs * 1000).toISOString()).not("open_interest", "is", null).order("ts").range(from, to),
    );
    const oiByTime = new Map(oiRows.map((r) => [Date.parse(r.ts) / 1000, Number(r.open_interest)]));
    const openInterest = hours.map((ts) => oiByTime.get(ts) ?? null);

    const runs = await all<{ ts: string; equity: number; hold_equity: number | null }>((from, to) =>
      db.from("agent_runs").select("ts, equity, hold_equity").eq("agent_id", agent.id).order("ts").range(from, to),
    );
    const trades = await all<{ ts: string; side: string; reason: string; price: number }>((from, to) =>
      db.from("trades").select("ts, side, reason, price").eq("agent_id", agent.id).order("ts").range(from, to),
    );
    if (!runs.length) {
      rows.push([label, "no runs yet"]);
      continue;
    }
    const firstRun = Date.parse(runs[0].ts) / 1000;
    const fromIndex = hours.indexOf(firstRun);
    const lastIndex = hours.indexOf(Date.parse(runs[runs.length - 1].ts) / 1000);

    // 1. Replay with the real engine.
    const replay = simulate({
      series: { [address]: closes },
      params: agentParams(agent),
      capital: Number(agent.start_capital),
      fromIndex,
      toIndex: lastIndex,
      times: hours,
      funding: { [address]: funding },
      openInterest: { [address]: openInterest },
    });
    const replayTrades = replay.fills.map((f: { index: number; side: string }) => `${hours[f.index]}:${f.side}`);
    const liveTrades = trades.map((t) => `${Date.parse(t.ts) / 1000}:${t.side}`);
    const missing = replayTrades.filter((key: string) => !liveTrades.includes(key));
    const extra = liveTrades.filter((key) => !replayTrades.includes(key));
    const liveEquity = Number(runs[runs.length - 1].equity);
    const equityGap = (replay.finalEquity / liveEquity - 1) * 100;

    // 2. Live record against the backtest.
    const equities = runs.map((r) => Number(r.equity));
    const capital = Number(agent.start_capital);
    const ret = (liveEquity / capital - 1) * 100;
    const holdLast = runs[runs.length - 1].hold_equity;
    const hold = holdLast == null ? null : (Number(holdLast) / capital - 1) * 100;
    const drop = maxDrawdown([capital, ...equities]) * 100;
    const entries = trades.filter((t) => (t.side === "buy" || t.side === "short") && t.reason === "signal").length;
    const days = runs.length / 24;
    const expected = EXPECTED[label];
    const expectedEntries = expected ? (expected.entriesPerYear * days) / 365 : null;

    const flags: string[] = [];
    if (missing.length || extra.length) flags.push(`ENGINE: ${missing.length} replay-only, ${extra.length} live-only trades`);
    if (Math.abs(equityGap) > 0.5) flags.push(`ENGINE: equity gap ${pct(equityGap, 2)}`);
    if (drop > DROP_LIMIT) flags.push(`DROP over the ${DROP_LIMIT}% limit`);
    else if (expected && drop > expected.drop) flags.push(`drop above backtest (${expected.drop}%)`);
    // A trade pace check only means something after a few weeks.
    if (expectedEntries != null && days >= 28 && (entries > expectedEntries * 3 || entries < expectedEntries / 3)) flags.push(`entries ${entries} vs ~${expectedEntries.toFixed(1)} expected`);

    const open = trades.length && ["buy", "short"].includes(trades[trades.length - 1].side) ? trades[trades.length - 1].side : "flat";
    rows.push([
      label,
      `${days.toFixed(1)}d`,
      pct(ret, 2),
      hold == null ? "-" : pct(hold, 2),
      `${drop.toFixed(1)}%`,
      expected ? `${expected.drop}%` : "-",
      `${entries}${expectedEntries != null ? ` (~${expectedEntries.toFixed(1)})` : ""}`,
      open === "buy" ? "long" : open,
      `${replay.fills.length}/${trades.length} ${pct(equityGap, 2)}`,
      flags.length ? flags.join("; ") : "OK",
    ]);
  }

  const header = ["agent", "live", "return", "hold", "worst drop", "backtest drop", "entries (expected)", "now", "replay trades/equity", "status"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  console.log(header.map((h, i) => h.padEnd(widths[i])).join("  "));
  for (const row of rows) console.log(row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  "));
  console.log("\nPaper trading. 'replay' = the real engine on the same closes and funding the runner loads; trades must match hour and side.");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
