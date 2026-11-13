import { NextResponse, type NextRequest } from "next/server";

import { writeStrategy } from "@/lib/ai/write-strategy";
import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/**
 * Studio prompt mode: turns a plain words strategy into Custom rules (lib/ai/write-strategy.ts,
 * shared with the API's write_strategy tool).
 */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (isBlockedCountry(countryFromHeaders(request.headers))) return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const result = await writeStrategy(db(), owner, body?.prompt);
  if (!result.ok) return NextResponse.json(result.costUsd === undefined ? { error: result.error } : { error: result.error, costUsd: result.costUsd }, { status: result.status });
  return NextResponse.json({ rules: result.rules, notes: result.notes, summary: result.summary, costUsd: result.costUsd });
}
