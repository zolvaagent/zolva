/**
 * Records the rules fingerprint of agents made before fingerprints existed
 * (supabase/migrations/20261127000100_rules_fingerprint.sql). The database stamps the time, so the
 * agent page shows the day it was recorded, not the agent's start. Only fills empty hashes.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backfill-rules-hash.mts [--write]
 *
 * Without --write it only counts what it would record.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { rulesFingerprint, type FingerprintAgent } from "../lib/agents/fingerprint.ts";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const write = process.argv.includes("--write");
  // One page of rows at a time (Supabase returns at most 1,000); ordered by id so pages stay stable.
  const PAGE = 500;
  let found = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("agents").select("id, strategy, params, token_addresses, rules_hash").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const agent of data) {
      if (agent.rules_hash) continue;
      found++;
      if (!write) continue;
      const { error: updateError } = await db.from("agents").update({ rules_hash: rulesFingerprint(agent as unknown as FingerprintAgent) }).eq("id", agent.id).is("rules_hash", null);
      if (updateError) throw new Error(`${agent.id}: ${updateError.message}`);
    }
    if (data.length < PAGE) break;
  }
  console.log(write ? `recorded ${found} fingerprints` : `would record ${found} fingerprints (add --write)`);
}

await main();
