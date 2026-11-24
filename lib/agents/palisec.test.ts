import { describe, expect, it } from "vitest";

import { parsePalisecAccount, publicPalisecAccount, ZOLVA_LINK_KEY } from "./palisec";

const DEMO = "0x9aEC761B2F0FdA08C683e8388478C9A2F7C9170c";

describe("parsePalisecAccount", () => {
  it("stores any casing checksummed", () => {
    expect(parsePalisecAccount(DEMO.toLowerCase())).toEqual({ ok: true, address: DEMO });
    expect(parsePalisecAccount(`  ${DEMO.toUpperCase().replace("0X", "0x")}  `)).toEqual({ ok: true, address: DEMO });
  });

  it("clears on null, empty or whitespace", () => {
    expect(parsePalisecAccount(null)).toEqual({ ok: true, address: null });
    expect(parsePalisecAccount("")).toEqual({ ok: true, address: null });
    expect(parsePalisecAccount("   ")).toEqual({ ok: true, address: null });
  });

  it("refuses what is not an address", () => {
    for (const input of ["0x123", "palisec.eth", `${DEMO}00`, DEMO.slice(2), 42, { address: DEMO }, undefined]) {
      expect(parsePalisecAccount(input).ok).toBe(false);
    }
  });

  it("refuses the zero address", () => {
    expect(parsePalisecAccount(`0x${"0".repeat(40)}`).ok).toBe(false);
  });
});

describe("publicPalisecAccount", () => {
  it("is chain 4663 with the address, or null", () => {
    expect(publicPalisecAccount(DEMO)).toEqual({ chainId: 4663, address: DEMO });
    expect(publicPalisecAccount(null)).toBeNull();
    expect(publicPalisecAccount(undefined)).toBeNull();
  });
});

it("uses keccak256('zolva') as the AgentLinks key Palisec writes", () => {
  expect(ZOLVA_LINK_KEY).toBe("0x8e867b3e0fc41f88c1a35774ed3261e06d06b233e37695f0b1b987d10eed781e");
});
