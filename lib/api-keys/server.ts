import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bearerToken, generateApiKey, hashApiKey, keyPrefix, looksLikeApiKey, type ApiCaller, type ApiKeyScope } from "./keys";

export type { ApiCaller } from "./keys";

/**
 * API keys in the database (table api_keys, migration 20261113000500_api_keys). The
 * Dashboard routes (app/api/keys) make, list and revoke them while logged in; the public
 * API and the MCP server check them from the Authorization header.
 */

export type KeyCheck = { kind: "none" } | { kind: "invalid" } | { kind: "ok"; caller: ApiCaller };

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type ApiKeyEventRow = {
  id: number;
  keyName: string;
  action: string;
  agentId: string | null;
  result: string;
  detail: string | null;
  createdAt: string;
};

/**
 * Reads "Authorization: Bearer zk_..." and finds the key. No header is "none" (the
 * public, keyless API); a header with a wrong, unknown or revoked key is "invalid".
 * last_used_at is written at most once a minute per key.
 */
export async function checkApiKey(db: SupabaseClient, headers: Headers): Promise<KeyCheck> {
  const token = bearerToken(headers);
  if (token === null) return { kind: "none" };
  if (!looksLikeApiKey(token)) return { kind: "invalid" };
  const hash = await hashApiKey(token);
  const { data, error } = await db.from("api_keys").select("id, owner, scopes").eq("key_hash", hash).is("revoked_at", null).maybeSingle();
  if (error) throw new Error(`Checking the API key failed: ${error.message}`);
  if (!data) return { kind: "invalid" };
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).or(`last_used_at.is.null,last_used_at.lt."${minuteAgo}"`);
  return { kind: "ok", caller: { keyId: data.id, owner: data.owner, scopes: data.scopes as ApiKeyScope[] } };
}

/** Makes a key and returns its secret, which is never stored and cannot be shown again. */
export async function createApiKey(
  db: SupabaseClient,
  owner: string,
  input: { name: string; scopes: ApiKeyScope[]; country: string | null },
): Promise<{ key: ApiKeyRow; secret: string } | { error: "limit" }> {
  const secret = generateApiKey();
  const { data, error } = await db
    .from("api_keys")
    .insert({ owner, name: input.name, scopes: input.scopes, country: input.country, key_hash: await hashApiKey(secret), key_prefix: keyPrefix(secret) })
    .select("id, name, key_prefix, scopes, created_at, last_used_at")
    .single();
  if (error) {
    if (error.message.includes("api_key_limit")) return { error: "limit" };
    throw new Error(`Saving the API key failed: ${error.message}`);
  }
  return { key: toRow(data), secret };
}

type KeyRecord = { id: string; name: string; key_prefix: string; scopes: string[]; created_at: string; last_used_at: string | null };

const toRow = (row: KeyRecord): ApiKeyRow => ({
  id: row.id,
  name: row.name,
  prefix: row.key_prefix,
  scopes: row.scopes as ApiKeyScope[],
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

/** The owner's keys that are not revoked, newest first. */
export async function listApiKeys(db: SupabaseClient, owner: string): Promise<ApiKeyRow[]> {
  const { data, error } = await db
    .from("api_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at")
    .eq("owner", owner)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Loading API keys failed: ${error.message}`);
  return (data as KeyRecord[]).map(toRow);
}

/** Revokes one of the owner's keys. Returns false when the owner has no such key. */
export async function revokeApiKey(db: SupabaseClient, owner: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const { data, error } = await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("owner", owner).is("revoked_at", null).select("id");
  if (error) throw new Error(`Revoking the API key failed: ${error.message}`);
  return data.length > 0;
}

/** The latest audit events of the owner's keys (revoked keys included), newest first. */
export async function listApiKeyEvents(db: SupabaseClient, owner: string, limit = 20): Promise<ApiKeyEventRow[]> {
  const { data, error } = await db
    .from("api_key_events")
    .select("id, action, agent_id, result, detail, created_at, api_keys(name)")
    .eq("owner", owner)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Loading API key events failed: ${error.message}`);
  return data.map((row) => {
    const key = row.api_keys as unknown as { name: string } | { name: string }[] | null;
    return {
      id: row.id,
      keyName: (Array.isArray(key) ? key[0]?.name : key?.name) ?? "Deleted key",
      action: row.action,
      agentId: row.agent_id,
      result: row.result,
      detail: row.detail,
      createdAt: row.created_at,
    };
  });
}
