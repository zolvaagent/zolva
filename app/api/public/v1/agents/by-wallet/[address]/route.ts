import type { NextRequest } from "next/server";

import { TTL } from "@/lib/public-api/data";
import { apiError, publicGet, publicOptions } from "@/lib/public-api/http";
import { parseWalletAddress, walletBody } from "@/lib/public-api/wallet";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/agents/by-wallet/{address}: { "zolva": true } when the wallet belongs to a
 * Zolva agent registered on Rushr, { "zolva": false } otherwise. Boolean only, no owner or other
 * data. The address is not case sensitive; a malformed one is a 400. Cached 5 minutes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const address = parseWalletAddress((await params).address);
  if (!address) return apiError(400, "invalid_input", "Send a wallet address: 0x followed by 40 hex characters.");
  return publicGet(request, TTL.agents, () => walletBody(db(), address));
}

export const OPTIONS = publicOptions;
