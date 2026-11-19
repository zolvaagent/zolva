import { describe, expect, it } from "vitest";

import { parseCheckAnswer, qproofCheck } from "./qproof";

const TOKEN = "0x2c30e8e77b752bf9f945a9bf99427ee0b60c50be";

// Shape of a real qproof_check answer (2026-11-19, ORRY, trimmed).
const ready = {
  version: 2,
  state: "ready",
  subject: { chain: "robinhood", address: TOKEN },
  report: { status: "observed", completedAt: "2026-11-19T03:10:00.000Z", verdict: { level: "watch", label: "Watch", headline: "Insiders hold at least 8.6%" } },
  queued: false,
  retryAfter: null,
  verdict: { level: "watch", label: "Watch", reason: "Insiders hold at least 8.6%", headline: "Insiders hold at least 8.6%" },
};
const rpc = (answer: unknown) => JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(answer) }] } });

describe("parseCheckAnswer", () => {
  it("reads the state, verdict and completion time, and keeps the raw answer", () => {
    expect(parseCheckAnswer(rpc(ready))).toMatchObject({
      state: "ready",
      queued: false,
      retryAfterSec: null,
      level: "watch",
      label: "Watch",
      headline: "Insiders hold at least 8.6%",
      completedAtMs: Date.parse("2026-11-19T03:10:00.000Z"),
      raw: { version: 2 },
    });
  });

  it("reads a queued answer with a retry hint, and a server-sent event body", () => {
    const queued = parseCheckAnswer(`event: message\ndata: ${rpc({ state: "missing", queued: true, retryAfter: 120 })}\n\n`);
    expect(queued).toMatchObject({ state: "missing", queued: true, retryAfterSec: 120, level: null, completedAtMs: null });
  });

  it("throws on JSON-RPC and tool errors", () => {
    expect(() => parseCheckAnswer(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad token" } }))).toThrow(/bad token/);
    expect(() => parseCheckAnswer(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "unsupported chain" }] } }))).toThrow(/unsupported chain/);
  });
});

describe("qproofCheck", () => {
  it("only ever calls the free qproof_check tool, never the paid scan", async () => {
    const sent: { url: string; body: { method: string; params: { name: string; arguments: Record<string, unknown> } } }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(rpc(ready), { status: 200 });
    }) as unknown as typeof fetch;
    await qproofCheck(TOKEN, true, fake);
    await qproofCheck(TOKEN, false, fake);
    expect(sent.map((call) => call.body.params.name)).toEqual(["qproof_check", "qproof_check"]);
    expect(sent.map((call) => call.body.params.arguments)).toEqual([
      { chain: "robinhood", token: TOKEN, request: true },
      { chain: "robinhood", token: TOKEN, request: false },
    ]);
    expect(sent[0].url).toMatch(/^https:\/\/qhooks\.com\/mcp/);
  });

  it("passes a 429 and its Retry-After back without parsing", async () => {
    const limited = (async () => new Response("slow down", { status: 429, headers: { "retry-after": "900" } })) as unknown as typeof fetch;
    expect(await qproofCheck(TOKEN, true, limited)).toEqual({ status: 429, answer: null, retryAfterSec: 900 });
  });
});
