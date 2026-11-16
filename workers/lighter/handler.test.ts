import { describe, expect, it } from "vitest";

import { handle, type Deps, type LighterEnv, type Signer } from "./handler";

const API = "https://lighter.test";
const ENV: LighterEnv = {
  LIGHTER_API: API,
  LIGHTER_CHAIN_ID: "300",
  LIGHTER_ENABLED: "true",
  INTERNAL_TOKEN: "t0ken",
  LIGHTER_KEYS: JSON.stringify({ "77": { apiKeyIndex: 4, privateKey: "ab".repeat(40) } }),
};
const SOL = { code: 200, order_book_details: [{ symbol: "SOL", market_id: 3, status: "active", min_base_amount: "0.050", min_quote_amount: "10.000000", size_decimals: 3, price_decimals: 3, last_trade_price: 71.009 }] };
const account = (size: number, sign = 1) => ({ code: 200, accounts: [{ index: 77, collateral: "50.000000", available_balance: "40.000000", positions: size ? [{ market_id: 3, symbol: "SOL", sign, position: String(size), avg_entry_price: "71.0", unrealized_pnl: "0", margin_mode: 1 }] : [] }] });

/** A fake Lighter: answers by path, records every call, and moves the position after an accepted order. */
function fakeLighter(options: { fillTo?: { size: number; sign: number }; sendCode?: number; afterChecks?: number } = {}) {
  const calls: { path: string; body?: string; userAgent?: string }[] = [];
  let sent = false;
  let checksAfterSend = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname + url.search, body: typeof init?.body === "string" ? init.body : undefined, userAgent: new Headers(init?.headers).get("user-agent") ?? undefined });
    const reply = (body: unknown) => Response.json(body);
    if (url.pathname === "/api/v1/orderBookDetails") return reply(SOL);
    if (url.pathname === "/api/v1/nextNonce") return reply({ code: 200, nonce: 12 });
    if (url.pathname === "/api/v1/sendTx") {
      sent = true;
      return reply({ code: options.sendCode ?? 200, message: options.sendCode ? "price protection" : undefined, tx_hash: "abc123" });
    }
    if (url.pathname === "/api/v1/account") {
      if (sent) checksAfterSend++;
      const filled = sent && options.fillTo && checksAfterSend > (options.afterChecks ?? 0);
      return reply(filled ? account(options.fillTo!.size, options.fillTo!.sign) : account(0));
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const signed: unknown[] = [];
  const signer: Signer = {
    async signOrder(_key, accountIndex, order) {
      signed.push({ accountIndex, ...order });
      return { txHash: "local", txInfo: JSON.stringify({ Nonce: order.nonce, Sig: "x" }) };
    },
    async signLeverage(_key, accountIndex, change) {
      signed.push({ accountIndex, ...change });
      return { txHash: "lev", txInfo: "{}" };
    },
  };
  const deps: Deps = { fetch: fetchImpl, signer, sleep: async () => {}, now: () => 1_794_722_181_770 };
  return { deps, calls, signed };
}

const post = (path: string, body: unknown, token = "t0ken") =>
  new Request(`https://zolva-lighter.internal${path}`, { method: "POST", headers: { "content-type": "application/json", "x-internal-token": token }, body: JSON.stringify(body) });

describe("zolva-lighter handler", () => {
  it("refuses calls without the internal token", async () => {
    const { deps } = fakeLighter();
    expect((await handle(post("/order", {}, "wrong"), ENV, deps)).status).toBe(401);
    expect((await handle(post("/order", {}), { ...ENV, INTERNAL_TOKEN: undefined }, deps)).status).toBe(401);
  });

  it("sends nothing while the kill switch is off", async () => {
    const { deps, calls } = fakeLighter();
    const response = await handle(post("/order", { accountIndex: 77, marketId: 3, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), { ...ENV, LIGHTER_ENABLED: "false" }, deps);
    expect(response.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("refuses an account it has no key for", async () => {
    const { deps } = fakeLighter();
    expect((await handle(post("/order", { accountIndex: 5, marketId: 3, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), ENV, deps)).status).toBe(403);
  });

  it("buys $20 of SOL: signs the scaled order with the fetched nonce, sends it and confirms the fill", async () => {
    const { deps, calls, signed } = fakeLighter({ fillTo: { size: 0.281, sign: 1 } });
    const response = await handle(post("/order", { accountIndex: 77, marketId: 3, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), ENV, deps);
    const body = await response.json();
    expect(body).toMatchObject({ status: "filled", filledBase: 0.281, plannedBase: 0.281, txHash: "abc123" });
    // 20 / 71.009 = 0.28165 -> 281 at 3 decimals; worst price 71.009 x 1.005 = 71.364045, rounded up -> 71365.
    expect(signed).toEqual([{ accountIndex: 77, marketId: 3, clientOrderIndex: 1_794_722_181_770, baseAmount: 281, price: 71365, isAsk: false, reduceOnly: false, nonce: 12 }]);
    const send = calls.find((call) => call.path === "/api/v1/sendTx")!;
    expect(new URLSearchParams(send.body).get("tx_type")).toBe("14");
    expect(new URLSearchParams(send.body).get("price_protection")).toBe("true");
    // Lighter's testnet answers 403 without a User-Agent.
    expect(calls.every((call) => call.userAgent?.startsWith("zolva-lighter/"))).toBe(true);
  });

  it("opens a short with a sell and reports it from the signed position", async () => {
    const { deps, signed } = fakeLighter({ fillTo: { size: 0.281, sign: -1 } });
    const body = await (await handle(post("/order", { accountIndex: 77, marketId: 3, side: "sell", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), ENV, deps)).json();
    expect(body).toMatchObject({ status: "filled", position: { size: -0.281 } });
    expect(signed[0]).toMatchObject({ isAsk: true, price: 70653 });
  });

  it("skips orders under Lighter's $10 minimum without signing anything", async () => {
    const { deps, signed, calls } = fakeLighter();
    const body = await (await handle(post("/order", { accountIndex: 77, marketId: 3, side: "buy", usd: 6, reduceOnly: false, maxSlippageBps: 50 }), ENV, deps)).json();
    expect(body).toMatchObject({ status: "skipped", detail: expect.stringMatching(/minimum/) });
    expect(signed).toEqual([]);
    expect(calls.some((call) => call.path === "/api/v1/sendTx")).toBe(false);
  });

  it("reports a rejected send, and an accepted order that never filled as unconfirmed (no blind retry)", async () => {
    const rejected = fakeLighter({ sendCode: 21100 });
    expect(await (await handle(post("/order", { accountIndex: 77, marketId: 3, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), ENV, rejected.deps)).json()).toMatchObject({ status: "rejected", detail: "price protection" });
    const silent = fakeLighter();
    expect(await (await handle(post("/order", { accountIndex: 77, marketId: 3, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), ENV, silent.deps)).json()).toMatchObject({ status: "unconfirmed", txHash: "abc123" });
    expect(silent.calls.filter((call) => call.path === "/api/v1/sendTx")).toHaveLength(1);
  });

  it("waits for a slow fill", async () => {
    const { deps } = fakeLighter({ fillTo: { size: 0.281, sign: 1 }, afterChecks: 3 });
    expect(await (await handle(post("/order", { accountIndex: 77, marketId: 3, side: "buy", usd: 20, reduceOnly: false, maxSlippageBps: 50 }), ENV, deps)).json()).toMatchObject({ status: "filled" });
  });

  it("sets isolated 1x leverage, and refuses more than 3x", async () => {
    const { deps, signed, calls } = fakeLighter();
    expect(await (await handle(post("/leverage", { accountIndex: 77, marketId: 3, leverage: 1 }), ENV, deps)).json()).toMatchObject({ status: "accepted" });
    expect(signed).toEqual([{ accountIndex: 77, marketId: 3, fraction: 10000, marginMode: 1, nonce: 12 }]);
    expect(new URLSearchParams(calls.find((call) => call.path === "/api/v1/sendTx")!.body).get("tx_type")).toBe("20");
    expect((await handle(post("/leverage", { accountIndex: 77, marketId: 3, leverage: 10 }), ENV, deps)).status).toBe(400);
  });

  it("reads the account even with the kill switch off, and never returns keys", async () => {
    const { deps } = fakeLighter({ fillTo: { size: 1, sign: 1 } });
    const response = await handle(new Request("https://zolva-lighter.internal/account?index=77", { headers: { "x-internal-token": "t0ken" } }), { ...ENV, LIGHTER_ENABLED: "false" }, deps);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ index: 77, collateral: 50 });
    expect(text).not.toContain("abab");
  });
});
