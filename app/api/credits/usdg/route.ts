import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";
import { creditUsdgPayment, usdgTopUpInfo } from "@/lib/usdg-topup-server";
import { TopUpError } from "@/lib/zolva-topup-server";

export const dynamic = "force-dynamic";

/** What the "Top up with USDG" dialog needs: USDG, Zolva's receiving address and the limits. */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  return NextResponse.json(usdgTopUpInfo());
}

/** Credits a USDG payment: { txHash } of a transfer from your wallet to Zolva. */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { txHash?: unknown } | null;
  if (typeof body?.txHash !== "string") return NextResponse.json({ error: "Missing transaction hash." }, { status: 400 });
  try {
    return NextResponse.json(await creditUsdgPayment(db(), owner, body.txHash));
  } catch (cause) {
    if (cause instanceof TopUpError) return NextResponse.json({ error: cause.message }, { status: 400 });
    throw cause;
  }
}
