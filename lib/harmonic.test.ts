import { describe, expect, it } from "vitest";

import { blocksTrading, fetchSession, parseSession } from "./harmonic";

const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";

// Shape of a real answer from /api/keeper/session/<address> (2026-11-12, trimmed).
const halted = {
  ok: true,
  token: NVDA,
  symbol: "NVDA",
  canExec: false,
  verdict: "halted",
  reason: "the session oracle's row reads halted: the issuer's feed says trading is halted",
  at: "2026-11-12T03:23:13.243Z",
};

describe("parseSession", () => {
  it("reads the verdict for the right token, whatever the address case", () => {
    expect(parseSession(halted, NVDA.toUpperCase().replace("0X", "0x"))).toEqual({ verdict: "halted", reason: halted.reason, at: halted.at });
  });

  it("ignores an answer for another token", () => {
    expect(parseSession(halted, "0x1b0e319c6a659f002271b69db8a7df2f911c153e")).toBeNull();
  });

  it("ignores unknown verdicts and failed answers", () => {
    expect(parseSession({ ...halted, verdict: "closed" }, NVDA)).toBeNull();
    expect(parseSession({ ...halted, ok: false }, NVDA)).toBeNull();
    expect(parseSession("nope", NVDA)).toBeNull();
  });
});

describe("blocksTrading", () => {
  it("holds only on an issuer halt or pause", () => {
    expect(blocksTrading("halted")).toBe(true);
    expect(blocksTrading("paused")).toBe(true);
    for (const verdict of ["unknown", "held", "stale", "open"] as const) expect(blocksTrading(verdict)).toBe(false);
  });
});

describe("fetchSession", () => {
  it("returns null instead of throwing when Harmonic is down", async () => {
    const down = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(fetchSession(NVDA, { fetchImpl: down })).resolves.toBeNull();
  });

  it("returns null on an error status", async () => {
    const error = (async () => new Response("bad", { status: 502 })) as unknown as typeof fetch;
    await expect(fetchSession(NVDA, { fetchImpl: error })).resolves.toBeNull();
  });

  it("reads a good answer", async () => {
    const ok = (async () => Response.json(halted)) as unknown as typeof fetch;
    await expect(fetchSession(NVDA, { fetchImpl: ok })).resolves.toMatchObject({ verdict: "halted" });
  });
});
