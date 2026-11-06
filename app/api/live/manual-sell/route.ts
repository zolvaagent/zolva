import { NextResponse, type NextRequest } from "next/server";
import type { Hex } from "viem";

import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ManualSellError, recordManualSell } from "@/lib/live/manual-sell";
import { createChainClient } from "@/lib/prices/onchain";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Records a "Sell position" swap the owner signed: { agentId, txHash }. The amounts are read from the chain. */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { agentId?: unknown; txHash?: unknown } | null;
  if (typeof body?.agentId !== "string" || typeof body.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return NextResponse.json({ error: "Missing agent or transaction." }, { status: 400 });
  }
  try {
    const sale = await recordManualSell(db(), createChainClient(env.robinhoodRpcUrl), { owner, agentId: body.agentId, txHash: body.txHash as Hex });
    return NextResponse.json(sale);
  } catch (cause) {
    if (cause instanceof ManualSellError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error("manual sell", cause instanceof Error ? cause.message.replace(/https?:\/\/\S+/g, "[url]") : cause);
    return NextResponse.json({ error: "Recording the sale failed. The swap itself went through; try recording again in a minute." }, { status: 500 });
  }
}
