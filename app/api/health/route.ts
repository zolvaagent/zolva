import { NextResponse } from "next/server";

import { MissingEnvError } from "@/lib/env";
import { db } from "@/lib/supabase";

// Must hit the database on every call, never a cached answer.
export const dynamic = "force-dynamic";

/**
 * Setup check: confirms the app can reach Supabase and that the migrations
 * ran. Returns row counts only, nothing private.
 */
export async function GET() {
  try {
    const client = db();
    const [tokens, candles] = await Promise.all([
      client.from("tokens").select("*", { count: "exact", head: true }),
      client.from("candles").select("*", { count: "exact", head: true }),
    ]);
    const error = tokens.error ?? candles.error;
    if (error) {
      return NextResponse.json({ ok: false, error: `Database query failed: ${error.message}` }, { status: 503 });
    }
    return NextResponse.json({ ok: true, tokens: tokens.count, candles: candles.count });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    throw error;
  }
}
