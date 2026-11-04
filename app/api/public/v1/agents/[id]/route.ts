import type { NextRequest } from "next/server";

import { agentBody, TTL } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/agents/{id}: one published paper agent with its settings, hourly
 * value vs holding (7 days), positions, trades and the last 24 hours of decisions.
 * Private and live agents return 404, the same as unknown ids. Cached 5 minutes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return publicGet(request, TTL.agents, () => agentBody(id));
}

export const OPTIONS = publicOptions;
