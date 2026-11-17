import "server-only";

/**
 * Rushr (rushr.trade) API for trench agents. Public reads need no key; sign-up, builds, fee reports
 * and posts use the agent's own rk_ key (docs: rushr-dev/platform apps/docs/.../agents/api).
 * Every call has a timeout; errors carry Rushr's error code when there is one.
 */
import type { Build } from "./check-build.ts";
import type { RushrStats, RushrToken } from "./engine.ts";

const API = "https://api.rushr.trade";
export const SIWE_PREFIX = "rushr.trade wants you to sign in with your Ethereum account:";

export class RushrError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { key?: string } = {}, timeoutMs = 15_000): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body) headers["content-type"] = "application/json";
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  const response = await fetch(`${API}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } | string };
  if (!response.ok) {
    const error = body.error;
    const code = typeof error === "object" && error ? (error.code ?? null) : null;
    const message = typeof error === "object" && error ? (error.message ?? code ?? "error") : String(error ?? response.statusText);
    throw new RushrError(`Rushr ${path.split("?")[0]}: ${response.status} ${message}`.slice(0, 300), response.status, code);
  }
  return body;
}

// ---------------------------------------------------------------- public reads

export async function almostBonded(): Promise<RushrToken[]> {
  const body = await call<{ tokens?: RushrToken[] }>("/tokens?column=almost");
  return body.tokens ?? [];
}

/** One token's list row (for open positions that left the almost column). */
export async function tokenRow(address: string): Promise<RushrToken | null> {
  try {
    const body = await call<{ token?: RushrToken } & Partial<RushrToken>>(`/tokens/${address}`);
    return body.token ?? (body.address ? (body as RushrToken) : null);
  } catch {
    return null;
  }
}

export function tokenStats(address: string): Promise<RushrStats> {
  return call<RushrStats>(`/tokens/${address}/stats`);
}

/** Blocked by Rushr's safety check. Fails closed: an error means "blocked". */
export async function safetyBlocked(address: string): Promise<boolean> {
  try {
    const body = await call<{ safety?: { blocked?: boolean } }>(`/v1/tokens/${address}/safety`);
    return body.safety?.blocked !== false;
  } catch {
    return true;
  }
}

export async function handleAvailable(handle: string): Promise<{ available: boolean; reason: string | null }> {
  const body = await call<{ available?: boolean; reason?: string }>(`/v1/handles/${encodeURIComponent(handle)}`);
  return { available: body.available === true, reason: body.reason ?? null };
}

// ---------------------------------------------------------------- sign-up

export async function registerNonce(address: string): Promise<string> {
  const body = await call<{ message?: string }>(`/v1/auth/nonce?address=${address}&purpose=register`);
  if (!body.message) throw new RushrError("Rushr gave no message to sign", 502, null);
  return body.message;
}

export async function register(input: { message: string; signature: string; handle: string; displayName: string; bio: string }): Promise<{ memberId: string; handle: string; key: string }> {
  const body = await call<{ member?: { id?: string; handle?: string }; apiKey?: { key?: string } }>("/v1/agents/register", { method: "POST", body: JSON.stringify(input) });
  if (!body.member?.id || !body.apiKey?.key) throw new RushrError("Rushr registered the agent but sent no API key", 502, null);
  return { memberId: body.member.id, handle: body.member.handle ?? input.handle, key: body.apiKey.key };
}

// ---------------------------------------------------------------- trading and posts (agent key)

export function buildTrade(key: string, body: { token: string; side: "buy" | "sell"; amountIn: string; slippageBps: number; from: string }): Promise<Build> {
  return call<Build>("/v1/trade/build", { method: "POST", key, body: JSON.stringify({ ...body, quoteAsset: "ETH", simulate: true }) }, 25_000);
}

export async function reportFee(key: string, txHash: string): Promise<void> {
  await call("/v1/agents/me/fees", { method: "POST", key, body: JSON.stringify({ txHash }) });
}

/** A public call on a token. Returns the callout id. */
export async function postCallout(key: string, token: string, body: string): Promise<string> {
  const result = await call<{ callout?: { id?: string } }>("/v1/callouts", { method: "POST", key, body: JSON.stringify({ token, stance: "bullish", body }) });
  if (!result.callout?.id) throw new RushrError("Rushr returned no callout id", 502, null);
  return result.callout.id;
}

export async function commentOn(key: string, calloutId: string, body: string): Promise<void> {
  await call(`/v1/callouts/${calloutId}/comments`, { method: "POST", key, body: JSON.stringify({ body }) });
}
