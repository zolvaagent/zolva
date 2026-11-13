import { NextResponse, type NextRequest } from "next/server";

import { MAX_KEYS_PER_ACCOUNT, parseKeyName, parseScopes } from "@/lib/api-keys/keys";
import { createApiKey, listApiKeyEvents, listApiKeys } from "@/lib/api-keys/server";
import { countryFromHeaders } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** The logged-in account's API keys and their latest audit events (Dashboard "API keys" card). */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const client = db();
  const [keys, events] = await Promise.all([listApiKeys(client, owner), listApiKeyEvents(client, owner)]);
  return NextResponse.json({ keys, events }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Makes a key: { "name", "scopes": [...] }. The secret is in this response only. The
 * country comes from this logged-in request (cf-ipcountry) and is stored with the key;
 * write scopes are refused for blocked countries.
 */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: unknown; scopes?: unknown } | null;
  const name = parseKeyName(body?.name);
  if (!name) return NextResponse.json({ error: "Give the key a name of up to 40 characters." }, { status: 400 });
  const country = countryFromHeaders(request.headers);
  const parsed = parseScopes(body?.scopes, country);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const created = await createApiKey(db(), owner, { name, scopes: parsed.scopes, country });
    if ("error" in created) return NextResponse.json({ error: `You can have ${MAX_KEYS_PER_ACCOUNT} keys. Revoke one to make another.` }, { status: 409 });
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Making the key failed. Please try again." }, { status: 500 });
  }
}
