import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { getMembership } from "@/lib/membership";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** The signed-in account's ZOLVA tier, limits, holdings and wallets (reads the chain at most every 10 minutes). */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  return NextResponse.json(await getMembership(db(), owner));
}

/** "Refresh": reads the balances again now. */
export async function POST() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  return NextResponse.json(await getMembership(db(), owner, { force: true }));
}
