import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so it must never reach the browser;
 * the server-only import above turns that mistake into a build error.
 *
 * A new client per call, never a module-level singleton: Cloudflare Workers
 * forbid reusing I/O objects across requests, so a shared client breaks when
 * two requests overlap (the hourly cron tick and a page view, or pg_cron and
 * the Worker cron). Create it once per request and pass it down.
 */
export function db(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
