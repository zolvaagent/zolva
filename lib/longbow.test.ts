import { beforeEach, describe, expect, it } from "vitest";

import { fetchLongbowMarkets, getLongbowListings, longbowListingFor, parseLongbowMarkets, resetLongbowCache } from "./longbow";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
// Longbow also lists "NVDAon", a different token with a similar name.
const NVDA_ON = "0xf1b95AE4E7700b962714702EA53784Dc8492a856";

// Shape of real entries from longbow.finance/api/markets (2026-11-13, trimmed).
const market = (overrides: Record<string, unknown>) => ({
  key: "NVDA",
  symbol: "NVDA",
  status: "live",
  closed: false,
  isShort: false,
  external: false,
  loan: "USDG",
  loanAddress: USDG,
  collateralAddress: NVDA,
  lltv: 0.625,
  availableToBorrow: 25.1,
  ...overrides,
});

const body = [
  market({}),
  market({ key: "NVDAon", symbol: "NVDAon", collateralAddress: NVDA_ON }),
  // Same collateral lent in WETH: not a USDG market, ignored.
  market({ key: "NVDA-WETH", loan: "WETH", loanAddress: WETH, lltv: 0.9 }),
  market({ key: "SHORT-ETH", isShort: true, collateralAddress: USDG }),
  market({ key: "BMNR", status: "soon", collateralAddress: "0x9a7842EDed60b0FE1e03eEc342C82A397c821eD0" }),
];

describe("parseLongbowMarkets", () => {
  it("keeps live long USDG markets, keyed by lowercase collateral address", () => {
    expect(parseLongbowMarkets(body)).toEqual([
      { collateral: NVDA.toLowerCase(), lltv: 0.625, url: "https://www.longbow.finance/borrow/NVDA?builder=Z68EKTE" },
      { collateral: NVDA_ON.toLowerCase(), lltv: 0.625, url: "https://www.longbow.finance/borrow/NVDAon?builder=Z68EKTE" },
    ]);
  });

  it("keeps the highest LLTV when a token has two USDG markets", () => {
    const listings = parseLongbowMarkets([market({ key: "NVDA-LOW", lltv: 0.385 }), market({ key: "NVDA" })]);
    expect(listings).toEqual([{ collateral: NVDA.toLowerCase(), lltv: 0.625, url: "https://www.longbow.finance/borrow/NVDA?builder=Z68EKTE" }]);
  });

  it("skips entries with a bad address, LLTV or key, and bodies that are not a list", () => {
    expect(parseLongbowMarkets([market({ collateralAddress: "NVDA" }), market({ lltv: 1.5 }), market({ lltv: "0.6" }), market({ key: "../admin" }), null, 7])).toEqual([]);
    expect(parseLongbowMarkets({ markets: body })).toEqual([]);
    expect(parseLongbowMarkets(null)).toEqual([]);
  });
});

describe("longbowListingFor", () => {
  const listings = parseLongbowMarkets(body);

  it("matches by address in any case, never by symbol", () => {
    expect(longbowListingFor(listings, NVDA.toUpperCase().replace("0X", "0x"))?.url).toBe("https://www.longbow.finance/borrow/NVDA?builder=Z68EKTE");
    expect(longbowListingFor(listings, NVDA_ON)?.url).toBe("https://www.longbow.finance/borrow/NVDAon?builder=Z68EKTE");
    expect(longbowListingFor(listings, "0x0000000000000000000000000000000000000001")).toBeNull();
  });
});

describe("fetching", () => {
  beforeEach(() => resetLongbowCache());

  const ok = (json: unknown) => (async () => Response.json(json)) as unknown as typeof fetch;

  it("returns null on an error status, a network error or a body that is not JSON", async () => {
    expect(await fetchLongbowMarkets({ fetchImpl: (async () => new Response("down", { status: 503 })) as unknown as typeof fetch })).toBeNull();
    expect(await fetchLongbowMarkets({ fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch })).toBeNull();
    expect(await fetchLongbowMarkets({ fetchImpl: (async () => new Response("<html>")) as unknown as typeof fetch })).toBeNull();
  });

  it("gives an empty list when Longbow fails, and does not retry for a few minutes", async () => {
    let calls = 0;
    const failing = (async () => {
      calls += 1;
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await getLongbowListings({ fetchImpl: failing, now: 0 })).toEqual([]);
    expect(await getLongbowListings({ fetchImpl: ok(body), now: 60_000 })).toEqual([]);
    expect(calls).toBe(1);
    // After the retry wait, a working Longbow is read again.
    expect(await getLongbowListings({ fetchImpl: ok(body), now: 10 * 60_000 })).toHaveLength(2);
  });

  it("reuses a good read for hours", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return Response.json(body);
    }) as unknown as typeof fetch;
    await getLongbowListings({ fetchImpl: counting, now: 0 });
    await getLongbowListings({ fetchImpl: counting, now: 2 * 3600_000 });
    expect(calls).toBe(1);
    await getLongbowListings({ fetchImpl: counting, now: 4 * 3600_000 });
    expect(calls).toBe(2);
  });
});
