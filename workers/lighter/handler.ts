/**
 * zolva-lighter: the only place that holds Lighter API keys and signs perps orders (real money).
 * The main site's hourly tick calls it through a Cloudflare Service Binding; it has no public route.
 *
 * Routes (all need the x-internal-token header):
 *   POST /order     { accountIndex, marketId, side, usd? | base?, reduceOnly, maxSlippageBps }
 *                    signs one market order (immediate or cancel), sends it, then confirms the fill
 *                    from the account's position (Lighter's sendTx only says "accepted").
 *   POST /leverage  { accountIndex, marketId, leverage } sets isolated margin at that leverage (1x first).
 *   GET  /account?index=…  positions and collateral (also works while trading is switched off).
 *
 * Kill switch: orders and leverage changes only run while LIGHTER_ENABLED is "true".
 * This file has no I/O of its own: fetch, the signer, sleep and the clock are passed in, so it is tested
 * with recorded responses (handler.test.ts) and runs the same in the Worker (index.ts).
 */
import {
  checkFill,
  clientOrderIndex,
  LIGHTER_TX,
  MARGIN_MODE_ISOLATED,
  marginFractionFor,
  parseAccount,
  parseMarket,
  planOrder,
  type LighterAccount,
  type OrderRequest,
} from "../../lib/live/lighter.ts";

export type LighterEnv = {
  /** API base, e.g. https://api.rh.lighter.xyz (mainnet RH) or https://api.rh-testnet.lighter.xyz. */
  LIGHTER_API: string;
  /** Chain id used in signatures: 466324 on RH mainnet, 300 on testnet. Must match LIGHTER_API. */
  LIGHTER_CHAIN_ID: string;
  /** "true" allows orders and leverage changes; anything else is the kill switch. */
  LIGHTER_ENABLED?: string;
  /** Shared secret the main Worker sends in x-internal-token. */
  INTERNAL_TOKEN?: string;
  /** Secret JSON: { "<accountIndex>": { "apiKeyIndex": 4, "privateKey": "<hex>" } }. Never logged or returned. */
  LIGHTER_KEYS?: string;
};

export type AgentKey = { apiKeyIndex: number; privateKey: string };

export type SignedTx = { txHash: string; txInfo: string };

export type Signer = {
  signOrder(
    key: AgentKey,
    accountIndex: number,
    order: { marketId: number; clientOrderIndex: number; baseAmount: number; price: number; isAsk: boolean; reduceOnly: boolean; nonce: number },
  ): Promise<SignedTx>;
  signLeverage(key: AgentKey, accountIndex: number, change: { marketId: number; fraction: number; marginMode: number; nonce: number }): Promise<SignedTx>;
};

export type Deps = { fetch: typeof fetch; signer: Signer; sleep: (ms: number) => Promise<void>; now: () => number };

/** Lighter's testnet refuses requests without a User-Agent (403), so every call names itself. */
const USER_AGENT = "zolva-lighter/1.0 (+https://zolvaagent.app)";

/** How long to look for the fill after sendTx: 8 checks, 1.5 s apart. */
const CONFIRM_TRIES = 8;
const CONFIRM_WAIT_MS = 1500;

export async function handle(request: Request, env: LighterEnv, deps: Deps): Promise<Response> {
  if (!env.INTERNAL_TOKEN || request.headers.get("x-internal-token") !== env.INTERNAL_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/account") {
      const index = Number(url.searchParams.get("index"));
      if (!Number.isSafeInteger(index)) return json({ error: "index is required" }, 400);
      const account = await readAccount(env, deps, index);
      return account ? json(account) : json({ error: "account not found" }, 404);
    }
    if (request.method === "POST" && (url.pathname === "/order" || url.pathname === "/leverage")) {
      if (env.LIGHTER_ENABLED !== "true") return json({ status: "disabled", detail: "Lighter trading is switched off (LIGHTER_ENABLED)" }, 503);
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return json({ error: "JSON body required" }, 400);
      const accountIndex = Number(body.accountIndex);
      const key = keyFor(env, accountIndex);
      if (!key) return json({ error: "no API key for this account" }, 403);
      return url.pathname === "/order" ? await placeOrder(env, deps, accountIndex, key, body) : await setLeverage(env, deps, accountIndex, key, body);
    }
    return json({ error: "not found" }, 404);
  } catch (cause) {
    // Never echo the URL or keys: only the message.
    return json({ status: "error", detail: cause instanceof Error ? cause.message.slice(0, 300) : "unexpected error" }, 502);
  }
}

async function placeOrder(env: LighterEnv, deps: Deps, accountIndex: number, key: AgentKey, body: Record<string, unknown>): Promise<Response> {
  const order: OrderRequest = {
    marketId: Number(body.marketId),
    side: body.side === "sell" ? "sell" : "buy",
    ...(body.usd !== undefined ? { usd: Number(body.usd) } : {}),
    ...(body.base !== undefined ? { base: Number(body.base) } : {}),
    reduceOnly: body.reduceOnly === true,
    maxSlippageBps: Number(body.maxSlippageBps),
  };
  if (!Number.isSafeInteger(order.marketId) || body.side === undefined) return json({ error: "marketId and side are required" }, 400);

  const market = parseMarket(await getJson(env, deps, `/api/v1/orderBookDetails?market_id=${order.marketId}`));
  if (!market) return json({ status: "rejected", detail: "market not found" }, 422);
  const plan = planOrder(order, market);
  if (!plan.ok) return json({ status: "skipped", detail: plan.reason });

  const before = await readAccount(env, deps, accountIndex);
  if (!before) return json({ status: "rejected", detail: "account not found" }, 422);
  const sizeBefore = positionSize(before, order.marketId);

  const nonce = await nextNonce(env, deps, accountIndex, key.apiKeyIndex);
  const signed = await deps.signer.signOrder(key, accountIndex, {
    marketId: order.marketId,
    clientOrderIndex: clientOrderIndex(deps.now()),
    baseAmount: plan.baseAmount,
    price: plan.price,
    isAsk: order.side === "sell",
    reduceOnly: order.reduceOnly,
    nonce,
  });
  const sent = await sendTx(env, deps, LIGHTER_TX.createOrder, signed.txInfo);
  if (sent.code !== 200) return json({ status: "rejected", detail: sent.message ?? `code ${sent.code}`, txHash: signed.txHash });

  for (let attempt = 0; attempt < CONFIRM_TRIES; attempt++) {
    await deps.sleep(CONFIRM_WAIT_MS);
    const after = await readAccount(env, deps, accountIndex);
    if (!after) continue;
    const fill = checkFill(sizeBefore, positionSize(after, order.marketId), order.side, plan.base, market.sizeDecimals);
    if (fill.status !== "none") {
      const position = after.positions.find((p) => p.marketId === order.marketId) ?? null;
      return json({ status: fill.status, filledBase: fill.filledBase, plannedBase: plan.base, worstPrice: plan.worstPrice, txHash: sent.tx_hash ?? signed.txHash, position });
    }
  }
  // Accepted but no position change seen: an IOC with nothing filled inside the price limit, or slow settlement.
  // The hourly reconcile settles which one it was; never retry blindly.
  return json({ status: "unconfirmed", plannedBase: plan.base, worstPrice: plan.worstPrice, txHash: sent.tx_hash ?? signed.txHash });
}

async function setLeverage(env: LighterEnv, deps: Deps, accountIndex: number, key: AgentKey, body: Record<string, unknown>): Promise<Response> {
  const marketId = Number(body.marketId);
  const leverage = Number(body.leverage);
  // Real money starts at 1x; the cap here is a second guard next to the database's.
  if (!Number.isSafeInteger(marketId) || !(leverage >= 1 && leverage <= 3)) return json({ error: "marketId and a leverage from 1 to 3 are required" }, 400);
  const nonce = await nextNonce(env, deps, accountIndex, key.apiKeyIndex);
  const signed = await deps.signer.signLeverage(key, accountIndex, { marketId, fraction: marginFractionFor(leverage), marginMode: MARGIN_MODE_ISOLATED, nonce });
  const sent = await sendTx(env, deps, LIGHTER_TX.updateLeverage, signed.txInfo);
  return sent.code === 200 ? json({ status: "accepted", txHash: sent.tx_hash ?? signed.txHash }) : json({ status: "rejected", detail: sent.message ?? `code ${sent.code}` });
}

function keyFor(env: LighterEnv, accountIndex: number): AgentKey | null {
  if (!Number.isSafeInteger(accountIndex) || !env.LIGHTER_KEYS) return null;
  try {
    const entry = (JSON.parse(env.LIGHTER_KEYS) as Record<string, Partial<AgentKey>>)[String(accountIndex)];
    if (!entry || typeof entry.privateKey !== "string" || !Number.isInteger(entry.apiKeyIndex)) return null;
    return { apiKeyIndex: entry.apiKeyIndex as number, privateKey: entry.privateKey };
  } catch {
    return null;
  }
}

async function readAccount(env: LighterEnv, deps: Deps, index: number): Promise<LighterAccount | null> {
  return parseAccount(await getJson(env, deps, `/api/v1/account?by=index&value=${index}`));
}

function positionSize(account: LighterAccount, marketId: number): number {
  return account.positions.find((p) => p.marketId === marketId)?.size ?? 0;
}

async function nextNonce(env: LighterEnv, deps: Deps, accountIndex: number, apiKeyIndex: number): Promise<number> {
  const body = (await getJson(env, deps, `/api/v1/nextNonce?account_index=${accountIndex}&api_key_index=${apiKeyIndex}`)) as { nonce?: number };
  if (!Number.isSafeInteger(body?.nonce)) throw new Error("could not read the next nonce");
  return body.nonce as number;
}

async function sendTx(env: LighterEnv, deps: Deps, txType: number, txInfo: string): Promise<{ code: number; message?: string; tx_hash?: string }> {
  const response = await deps.fetch(`${env.LIGHTER_API}/api/v1/sendTx`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams({ tx_type: String(txType), tx_info: txInfo, price_protection: "true" }).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as { code?: number; message?: string; tx_hash?: string };
  return { code: Number(body.code ?? response.status), message: body.message, tx_hash: body.tx_hash };
}

async function getJson(env: LighterEnv, deps: Deps, path: string): Promise<unknown> {
  const response = await deps.fetch(`${env.LIGHTER_API}${path}`, { headers: { accept: "application/json", "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Lighter ${path.split("?")[0]} answered ${response.status}`);
  return response.json();
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
