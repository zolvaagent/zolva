import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { PREMIUM_ENDPOINTS } from "@/lib/x402/catalog";
import { X402_ASSET, X402_NETWORK } from "@/lib/x402/protocol";

export const dynamic = "force-dynamic";

/** GET /api/x402/v1 (free): what the premium API offers, its prices and whether it is open. */
export async function GET() {
  const config = env.x402;
  return NextResponse.json(
    {
      open: config !== null && env.x402Relayer !== null,
      protocol: "x402 v1, exact scheme",
      network: X402_NETWORK,
      chainId: 4663,
      asset: { symbol: "USDG", address: X402_ASSET, decimals: 6 },
      payTo: config?.payTo ?? null,
      endpoints: Object.values(PREMIUM_ENDPOINTS).map((endpoint) => ({ ...endpoint, price: `${endpoint.price} USDG` })),
      docs: "https://zolvaagent.app/docs/premium-api",
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } },
  );
}
