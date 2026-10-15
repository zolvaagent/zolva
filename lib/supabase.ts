import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Service-role client. Bypasses RLS, so it must never reach the browser;
 * the server-only import above turns that mistake into a build error.
 */
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
