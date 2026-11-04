import type { NextRequest } from "next/server";

import { activityBody, TTL } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/activity: trades by published paper agents over the last 48 hours, newest first. Cached 60 seconds. */
export async function GET(request: NextRequest) {
  return publicGet(request, TTL.activity, activityBody);
}

export const OPTIONS = publicOptions;
