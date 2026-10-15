import { describe, expect, it, vi } from "vitest";

import { completeHoursOnly, fetchHourlyCandles, parseMultiPrices, parseOhlcv, repairBatch, toCandleRow } from "./geckoterminal";

const HOUR = 3600;
const body = (rows: unknown[]) => ({ data: { attributes: { ohlcv_list: rows } } });

describe("parseOhlcv", () => {
  it("returns candles oldest first", () => {
    const candles = parseOhlcv(
      body([
        [2 * HOUR, 11, 12, 10, 11.5, 900],
        [1 * HOUR, 10, 11, 9.5, 10.8, 1200],
      ]),
    );
    expect(candles.map((candle) => candle.time)).toEqual([HOUR, 2 * HOUR]);
    expect(candles[0]).toEqual({ time: HOUR, open: 10, high: 11, low: 9.5, close: 10.8, volumeUsd: 1200 });
  });

  it("drops rows off the hour or with non-positive prices", () => {
    const candles = parseOhlcv(
      body([
        [HOUR + 60, 10, 11, 9, 10, 1],
        [2 * HOUR, 0, 11, 9, 10, 1],
        [3 * HOUR, 10, 11, 9, -1, 1],
        [4 * HOUR, 10, 11, 9, 10.2, 5],
      ]),
    );
    expect(candles.map((candle) => candle.time)).toEqual([4 * HOUR]);
  });

  it("keeps one candle per hour, preferring the one with more volume", () => {
    const candles = parseOhlcv(
      body([
        [HOUR, 10, 11, 9, 10.1, 50],
        [HOUR, 10, 11, 9, 10.4, 300],
        [HOUR, 10, 11, 9, 10.2, 100],
      ]),
    );
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(10.4);
  });

  it("treats missing or negative volume as zero", () => {
    const [candle] = parseOhlcv(body([[HOUR, 10, 11, 9, 10, -3]]));
    expect(candle.volumeUsd).toBe(0);
  });

  it("throws on an unexpected response shape", () => {
    expect(() => parseOhlcv({ status: { error_code: 429 } })).toThrow(/ohlcv_list/);
  });
});

describe("completeHoursOnly", () => {
  it("drops the hour still in progress", () => {
    const now = (10 * HOUR + 1500) * 1000; // 25 minutes into hour 10
    const candles = parseOhlcv(
      body([
        [10 * HOUR, 1, 1, 1, 1, 0],
        [9 * HOUR, 1, 1, 1, 1, 0],
      ]),
    );
    expect(completeHoursOnly(candles, now).map((candle) => candle.time)).toEqual([9 * HOUR]);
  });
});

describe("toCandleRow", () => {
  it("maps to the candles table with an ISO hour", () => {
    const row = toCandleRow("0xabc", { time: HOUR, open: 1, high: 2, low: 0.5, close: 1.5, volumeUsd: 7 });
    expect(row).toEqual({ token_address: "0xabc", ts: "1970-01-01T01:00:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume_usd: 7, source: "ohlcv" });
  });

  it("marks snapshot rows", () => {
    expect(toCandleRow("0xabc", { time: HOUR, open: 1, high: 1, low: 1, close: 1, volumeUsd: 0 }, "snapshot").source).toBe("snapshot");
  });
});

describe("parseMultiPrices", () => {
  const response = {
    data: [
      // Token is the base side
      { attributes: { base_token_price_usd: "723.5", quote_token_price_usd: "1.0" }, relationships: { base_token: { data: { id: "t1" } }, quote_token: { data: { id: "usdg" } } } },
      // Token is the quote side
      { attributes: { base_token_price_usd: "1.0", quote_token_price_usd: "219.2" }, relationships: { base_token: { data: { id: "usdg" } }, quote_token: { data: { id: "t2" } } } },
      // Bad price is ignored
      { attributes: { base_token_price_usd: "0", quote_token_price_usd: "1.0" }, relationships: { base_token: { data: { id: "t3" } }, quote_token: { data: { id: "usdg" } } } },
    ],
    included: [
      { id: "t1", attributes: { address: "0xAAA" } },
      { id: "t2", attributes: { address: "0xbbb" } },
      { id: "t3", attributes: { address: "0xccc" } },
      { id: "usdg", attributes: { address: "0xusdg" } },
    ],
  };

  it("reads each token's price from whichever side it is on", () => {
    const prices = parseMultiPrices(response, ["0xaaa", "0xBBB", "0xccc"]);
    expect(Object.fromEntries(prices)).toEqual({ "0xaaa": 723.5, "0xbbb": 219.2 });
  });

  it("ignores tokens that were not asked for, like the USDG side", () => {
    expect(parseMultiPrices(response, ["0xaaa"]).has("0xusdg")).toBe(false);
  });
});

describe("repairBatch", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("rotates so every item is covered", () => {
    const seen = new Set([0, 1, 2, 3, 4].flatMap((hour) => repairBatch(items, hour, 2)));
    expect(seen.size).toBe(items.length);
  });

  it("wraps around the end of the list", () => {
    expect(repairBatch(items, 2, 2)).toEqual(["e", "a"]);
  });

  it("handles empty lists and oversized batches", () => {
    expect(repairBatch([], 3, 2)).toEqual([]);
    expect(repairBatch(["a"], 3, 2)).toEqual(["a"]);
  });
});

describe("fetchHourlyCandles", () => {
  it("asks for the token's USD price and pages with before_timestamp", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body([[HOUR, 1, 1, 1, 1, 0]])), { status: 200 }));
    await fetchHourlyCandles({ pool: "0xpool", token: "0xtoken", limit: 5, before: 7200 }, fetchImpl as unknown as typeof fetch);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v2/networks/robinhood/pools/0xpool/ohlcv/hour");
    expect(url.searchParams.get("token")).toBe("0xtoken");
    expect(url.searchParams.get("currency")).toBe("usd");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("before_timestamp")).toBe("7200");
  });

  it("throws on a non-429 error", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(fetchHourlyCandles({ pool: "0xpool", token: "0xtoken" }, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/500/);
  });
});
