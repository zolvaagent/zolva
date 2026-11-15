import { NextResponse, type NextRequest } from "next/server";

import { maxMarketsFor, STUDIO_STRATEGIES, strategyNeedsPerps } from "@/lib/agents/copy";
import { getMarket } from "@/lib/data/market";
import type { AgentParams } from "@/lib/engine/engine";
import { parseRules } from "@/lib/engine/rules";
import { checkLimit } from "@/lib/public-api/http";
import { checkRobustness } from "@/lib/studio/robustness";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Hours of history the check loads: about six months, more than the database holds today
 * (prices start 2026-06-26), so it covers all of it. Raise it as history grows; each extra
 * month adds about 700 hours per market to the load.
 */
const ROBUSTNESS_HOURS = 24 * 183;

/**
 * Studio "Check robustness" (lib/studio/robustness.ts). Runs on the server so a normal Studio
 * visit only loads the 900 hours its 30 day backtest needs. Public like the Studio backtest,
 * behind the public API's per-IP limit.
 */
export async function POST(request: NextRequest) {
  if ((await checkLimit(request)) === "limited") return NextResponse.json({ error: "Too many checks. Try again in a minute." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Send the agent's settings." }, { status: 400 });

  const strategy = STUDIO_STRATEGIES.find((key) => key === body.strategy);
  if (!strategy) return NextResponse.json({ error: "Pick a strategy." }, { status: 400 });
  const perps = body.venue === "perps";
  if (strategyNeedsPerps(strategy) && !perps) return NextResponse.json({ error: "This strategy trades perps." }, { status: 400 });
  let rules: AgentParams["rules"];
  if (strategy === "custom") {
    const parsed = parseRules(body.rules);
    if (!parsed.rules) return NextResponse.json({ error: parsed.errors[0] }, { status: 400 });
    rules = parsed.rules;
  }
  const maxPositionPct = Number(body.maxPositionPct);
  const stopLossPct = Number(body.stopLossPct);
  // Same ranges as the Studio sliders and agent creation (lib/agents/create.ts).
  if (!Number.isInteger(maxPositionPct) || maxPositionPct < 10 || maxPositionPct > 100) return NextResponse.json({ error: "Max per market must be between 10% and 100%." }, { status: 400 });
  if (!Number.isInteger(stopLossPct) || stopLossPct < 2 || stopLossPct > 25) return NextResponse.json({ error: "Stop loss must be between 2% and 25%." }, { status: 400 });
  const tokens = Array.isArray(body.tokens) ? [...new Set(body.tokens.map((token) => String(token).toLowerCase()))] : [];
  const maxMarkets = maxMarketsFor(strategy);
  if (tokens.length < 1 || tokens.length > maxMarkets) return NextResponse.json({ error: `Pick 1 to ${maxMarkets} markets.` }, { status: 400 });

  const params: AgentParams = { strategy, ...(rules ? { rules } : {}), maxPositionPct, stopLossPct, ...(perps ? { venue: "perps" as const } : {}) };
  const market = await getMarket(db(), { perps: true, hours: ROBUSTNESS_HOURS });
  const report = checkRobustness(market, tokens, params);
  if (!report.ok) return NextResponse.json({ error: report.reason }, { status: 422 });
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
