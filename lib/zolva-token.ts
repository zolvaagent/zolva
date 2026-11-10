import "server-only";

import type { TokenCard } from "@/components/site/TokenAddress";
import { env } from "@/lib/env";

/**
 * The launched ZOLVA token for public pages, or null before launch. Everything comes from
 * env (ZOLVA_TOKEN_ADDRESS, ZOLVA_POOL_ADDRESS, ZOLVA_TRADE_URL), set by `npm run token:launch`,
 * so the address is never typed into a page by hand. Pages using it must be dynamic, since the
 * Worker's env is not there at build time.
 */
export function zolvaTokenCard(): TokenCard | null {
  const token = env.zolvaToken;
  if (!token) return null;
  const links = env.zolvaLinks;
  return { address: token.address, pool: links.pool, tradeUrl: links.tradeUrl };
}
