import { NextResponse } from "next/server";

import { revokeApiKey } from "@/lib/api-keys/server";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/** Revokes one of the logged-in account's API keys. It stops working on the next request. */
export async function DELETE(_request: Request, context: RouteContext<"/api/keys/[id]">) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { id } = await context.params;
  try {
    if (!(await revokeApiKey(db(), owner, id))) return NextResponse.json({ error: "Key not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Revoking failed. Please try again." }, { status: 500 });
  }
}
