import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress, NONCE_COOKIE } from "@/lib/auth/session";
import { getMembership, linkWallet, unlinkWallet, WalletLinkError } from "@/lib/membership";
import { db } from "@/lib/supabase";

/**
 * Adds a wallet whose ZOLVA counts for the signed-in account. The browser first
 * gets a nonce from /api/auth/nonce (kept in an httpOnly cookie), then the
 * wallet signs linkWalletMessage: no transaction, no gas.
 */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const nonce = request.cookies.get(NONCE_COOKIE)?.value;
  const body = (await request.json().catch(() => null)) as { wallet?: unknown; signature?: unknown } | null;
  const wallet = typeof body?.wallet === "string" ? body.wallet : "";
  const signature = typeof body?.signature === "string" && /^0x[0-9a-fA-F]+$/.test(body.signature) ? (body.signature as `0x${string}`) : null;
  if (!nonce || !wallet || !signature) return NextResponse.json({ error: "Missing wallet, signature or nonce. Please try again." }, { status: 400 });

  const client = db();
  try {
    await linkWallet(client, owner, wallet, nonce, signature);
  } catch (cause) {
    if (cause instanceof WalletLinkError) return NextResponse.json({ error: cause.message }, { status: 400 });
    throw cause;
  }
  const response = NextResponse.json(await getMembership(client, owner, { force: true }));
  // The nonce is single use.
  response.cookies.delete(NONCE_COOKIE);
  return response;
}

/** Removes a linked wallet from the signed-in account. */
export async function DELETE(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { wallet?: unknown } | null;
  if (typeof body?.wallet !== "string") return NextResponse.json({ error: "Missing wallet." }, { status: 400 });
  const client = db();
  await unlinkWallet(client, owner, body.wallet);
  return NextResponse.json(await getMembership(client, owner, { force: true }));
}
