import "server-only";

import { PrivyClient } from "@privy-io/node";

import { env } from "@/lib/env";

/**
 * Email and Google login through Privy. Privy creates an embedded wallet for
 * each user, and that wallet address becomes the account key, exactly like a
 * wallet login, so the rest of the app does not care how someone signed in.
 */

let client: { appId: string; privy: PrivyClient } | null = null;

function privyClient(): PrivyClient | null {
  const config = env.privy;
  if (!config) return null;
  // One client per isolate: it caches Privy's token signing keys.
  if (client?.appId !== config.appId) {
    client = { appId: config.appId, privy: new PrivyClient({ appId: config.appId, appSecret: config.appSecret }) };
  }
  return client.privy;
}

export class PrivyLoginError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PrivyLoginError";
  }
}

type LinkedAccount = { type: string; address?: string; chain_type?: string; wallet_client_type?: string };

/** Verifies a Privy access token and returns the user's Ethereum wallet (lowercase). */
export async function walletFromPrivyToken(accessToken: string): Promise<string> {
  const privy = privyClient();
  if (!privy) throw new PrivyLoginError("Email and Google sign in are not set up yet.", 503);

  const claims = await privy
    .utils()
    .auth()
    .verifyAccessToken(accessToken)
    .catch(() => null);
  if (!claims) throw new PrivyLoginError("Your login could not be verified. Please try again.", 401);

  // Fetched fresh rather than read from a token, so a wallet created seconds
  // ago during sign up is already included.
  const user = await privy.users()._get(claims.user_id);
  const wallets = (user.linked_accounts as LinkedAccount[]).filter(
    (account) => account.type === "wallet" && account.chain_type === "ethereum" && /^0x[0-9a-fA-F]{40}$/.test(account.address ?? ""),
  );
  // Prefer the Privy embedded wallet; fall back to any linked Ethereum wallet.
  const wallet = wallets.find((account) => account.wallet_client_type === "privy") ?? wallets[0];
  if (!wallet?.address) throw new PrivyLoginError("Your account has no wallet yet. Please try again.", 409);
  return wallet.address.toLowerCase();
}
