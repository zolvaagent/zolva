import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/**
 * Called after the owner removed Zolva's signer from their wallet: pauses
 * their live agents (they could no longer sign) and takes the wallet off the
 * live allowlist. Paper agents are untouched.
 */
export async function POST() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const client = db();
  const { data: paused, error } = await client.from("agents").update({ status: "paused" }).eq("trading_wallet", owner).eq("mode", "live").eq("status", "active").select("id");
  if (error) return NextResponse.json({ error: "Pausing your live agents failed. Please try again." }, { status: 500 });
  const { error: listError } = await client.from("live_wallets").delete().eq("address", owner);
  if (listError) return NextResponse.json({ error: "Removing the wallet from live trading failed. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true, paused: paused?.length ?? 0 });
}
