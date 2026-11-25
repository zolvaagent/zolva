import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { createGuard, GuardianInputError, loadGuardian } from "@/lib/guardian/data";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Wallet Guardian for the signed-in account: GET the page data, POST a new guard. */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  try {
    return NextResponse.json(await loadGuardian(db(), owner));
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Loading Guardian failed. Please try again." }, { status: 500 });
  }
}

/** { wallet, tokenAddress, stopLossPct, takeProfitPct?, basisPrice? } */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    await createGuard(db(), owner, body ?? {});
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof GuardianInputError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Saving the guard failed. Please try again." }, { status: 500 });
  }
}
