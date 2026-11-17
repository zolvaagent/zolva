import { describe, expect, it } from "vitest";

import { officialTokenProblems, ROBINHOOD_STOCK_BEACON, stockIsToken0 } from "./official";

const proxy = `0x6080${ROBINHOOD_STOCK_BEACON.slice(2)}abcd`;
const facts = { code: proxy, referenceCode: proxy, name: "Anthropic • Robinhood Token", decimals: 18 };

describe("officialTokenProblems", () => {
  it("passes the official proxy", () => {
    expect(officialTokenProblems(facts)).toEqual([]);
  });

  it("rejects clones, empty addresses and wrong names", () => {
    expect(officialTokenProblems({ ...facts, code: "0x6080dead" }).join(" ")).toMatch(/clone/);
    expect(officialTokenProblems({ ...facts, code: "0x" }).join(" ")).toMatch(/No contract/);
    expect(officialTokenProblems({ ...facts, name: "ANT" }).join(" ")).toMatch(/Robinhood Token/);
    expect(officialTokenProblems({ ...facts, decimals: 6 }).join(" ")).toMatch(/18/);
  });
});

describe("stockIsToken0", () => {
  it("orders by address", () => {
    expect(stockIsToken0("0x1000000000000000000000000000000000000000", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168")).toBe(true);
    expect(stockIsToken0("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168")).toBe(false);
  });
});
