import type { NextRequest } from "next/server";

import { TTL, verifyBody } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/agents/{id}/verify: replays one published paper agent with the real engine over
 * every hour it ran and compares every trade and its value with the record (lib/agents/verify.ts).
 * Private, live and unknown agents return 404. Cached 5 minutes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return publicGet(request, TTL.agents, () => verifyBody(id));
}

export const OPTIONS = publicOptions;
