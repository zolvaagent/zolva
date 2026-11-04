import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";
import { creditBurn, topUpInfo, TopUpError } from "@/lib/zolva-topup-server";

export const dynamic = "force-dynamic";

/** What the "Pay with ZOLVA" dialog needs: the token, the burn address and today's price. */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  return NextResponse.json(await topUpInfo(db()));
}

/** Credits a ZOLVA burn: { txHash } of a transfer from your wallet to the burn address. */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { txHash?: unknown } | null;
  if (typeof body?.txHash !== "string") return NextResponse.json({ error: "Missing transaction hash." }, { status: 400 });
  try {
    return NextResponse.json(await creditBurn(db(), owner, body.txHash));
  } catch (cause) {
    if (cause instanceof TopUpError) return NextResponse.json({ error: cause.message }, { status: 400 });
    throw cause;
  }
}
