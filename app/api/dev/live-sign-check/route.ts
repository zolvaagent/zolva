import { PrivyClient } from "@privy-io/node";
import { NextResponse, type NextRequest } from "next/server";
import { encodeFunctionData, erc20Abi } from "viem";

import { env } from "@/lib/env";
import { ERC20_APPROVE_ABI, ROBINHOOD_CHAIN_ID, SWAP_ROUTER_02, USDG } from "@/lib/live/contracts";
import { secretsMatch } from "@/lib/secrets";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Real money step 2 check: proves Privy signing runs inside the Cloudflare
 * Worker runtime, not only in Node. Signs an allowed approve and asks for a
 * forbidden transfer; broadcasts nothing. Off unless LIVE_SIGN_CHECK=1 (set
 * locally for wrangler dev only) and called with the cron secret.
 */
export async function POST(request: NextRequest) {
  if (!env.liveSignCheck) return new NextResponse(null, { status: 404 });
  if (!secretsMatch(request.headers.get("x-cron-secret"), env.cronSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const privyConfig = env.privy;
  const key = env.privyAuthorizationKey;
  if (!privyConfig || !key) return NextResponse.json({ error: "Privy or signer key missing" }, { status: 500 });

  const { data: wallet, error } = await db().from("live_wallets").select("address, privy_wallet_id").limit(1).single();
  if (error || !wallet) return NextResponse.json({ error: "no allowlisted wallet" }, { status: 500 });

  const privy = new PrivyClient({ appId: privyConfig.appId, appSecret: privyConfig.appSecret });
  const sign = (to: string, data: `0x${string}`) =>
    privy
      .wallets()
      .ethereum()
      .signTransaction(wallet.privy_wallet_id, {
        // nonce 0 and a tiny fee: this transaction is only signed, never sent.
        params: { transaction: { type: 2, chain_id: ROBINHOOD_CHAIN_ID, to, data, value: 0, nonce: 0, gas_limit: 100_000, max_fee_per_gas: 1, max_priority_fee_per_gas: 0 } },
        authorization_context: { authorization_private_keys: [key] },
      });

  const startedAt = Date.now();
  const approve = await sign(USDG, encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [SWAP_ROUTER_02, 1n] }))
    .then((signed) => ({ signed: true, bytes: (signed.signed_transaction.length - 2) / 2 }))
    .catch((cause: unknown) => ({ signed: false, error: cause instanceof Error ? cause.message : String(cause) }));
  const transfer = await sign(USDG, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", 1n] }))
    .then(() => ({ refused: false }))
    .catch((cause: unknown) => ({ refused: true, error: (cause instanceof Error ? cause.message : String(cause)).slice(0, 160) }));

  return NextResponse.json({ wallet: wallet.address, approve, transfer, ms: Date.now() - startedAt, broadcast: false });
}
