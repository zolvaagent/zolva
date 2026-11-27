import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { parseWalletAddress, walletBody } from "./wallet";

const ADDRESS = "0x9aec761b2f0fda08c683e8388478c9a2f7c9170c";

/** A stand-in for the one query walletBody makes; records the filters it was given. */
function fakeDb(rows: { id: string }[], error: { message: string } | null = null) {
  const calls: unknown[][] = [];
  const query = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
    not: (...args: unknown[]) => (calls.push(["not", ...args]), query),
    limit: async (...args: unknown[]) => (calls.push(["limit", ...args]), { data: error ? null : rows, error }),
  };
  const client = { from: (table: string) => (calls.push(["from", table]), query) } as unknown as SupabaseClient;
  return { client, calls };
}

describe("parseWalletAddress", () => {
  it("lower cases a valid address, whatever its case", () => {
    expect(parseWalletAddress("0x9aEC761B2F0FdA08C683e8388478C9A2F7C9170c")).toBe(ADDRESS);
    expect(parseWalletAddress(ADDRESS)).toBe(ADDRESS);
  });

  it("refuses anything that is not 0x and 40 hex characters", () => {
    for (const bad of ["", "0x", "0x1234", ADDRESS.slice(0, -1), `${ADDRESS}0`, ADDRESS.replace("0x", ""), `0x${"g".repeat(40)}`, `${ADDRESS}/..`]) {
      expect(parseWalletAddress(bad)).toBeNull();
    }
  });
});

describe("walletBody", () => {
  it("is true when a trench agent registered on Rushr has the wallet, and says nothing else", async () => {
    const { client, calls } = fakeDb([{ id: "agent-1" }]);
    expect(await walletBody(client, ADDRESS)).toEqual({ zolva: true });
    expect(calls).toContainEqual(["from", "trench_agents"]);
    expect(calls).toContainEqual(["eq", "wallet_address", ADDRESS]);
    expect(calls).toContainEqual(["not", "rushr_handle", "is", null]);
    expect(calls).toContainEqual(["select", "id"]);
  });

  it("is false for a wallet no Zolva agent has", async () => {
    expect(await walletBody(fakeDb([]).client, ADDRESS)).toEqual({ zolva: false });
  });

  it("is true for the Lab agent's wallet without asking the database", async () => {
    const { client, calls } = fakeDb([]);
    expect(await walletBody(client, "0x9dec887dc8dd6bed2b7d8d0ce4db2471c174292c")).toEqual({ zolva: true });
    expect(calls).toEqual([]);
  });

  it("throws on a database error instead of answering false", async () => {
    await expect(walletBody(fakeDb([], { message: "boom" }).client, ADDRESS)).rejects.toThrow("boom");
  });
});
