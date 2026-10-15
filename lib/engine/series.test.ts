import { describe, expect, it } from "vitest";

import { buildCloseSeries, HOUR_SECONDS, median } from "./series";

const H = HOUR_SECONDS;
/** Candles at hours 0..n-1 with the given closes; null leaves the hour missing. */
const candles = (closes: (number | null)[]) =>
  closes.flatMap((close, i) => (close === null ? [] : [{ time: i * H, close }]));

describe("buildCloseSeries", () => {
  it("returns one entry per hour, including the last", () => {
    const series = buildCloseSeries(candles([10, 11, 12]), 0, 2 * H);
    expect(series.times).toEqual([0, H, 2 * H]);
    expect(series.closes).toEqual([10, 11, 12]);
  });

  it("carries the last close into hours without a candle", () => {
    const series = buildCloseSeries(candles([10, null, null, 13]), 0, 3 * H);
    expect(series.closes).toEqual([10, 10, 10, 13]);
    expect(series.filled).toEqual([H, 2 * H]);
  });

  it("leaves hours before the first price empty", () => {
    const series = buildCloseSeries(candles([null, null, 10]), 0, 2 * H);
    expect(series.closes).toEqual([null, null, 10]);
    expect(series.filled).toEqual([]);
  });

  it("rejects a one-hour spike and keeps the previous close", () => {
    const flat = Array(10).fill(100);
    const series = buildCloseSeries(candles([...flat, 500, 101]), 0, 11 * H);
    expect(series.closes.slice(-2)).toEqual([100, 101]);
    expect(series.rejected).toEqual([10 * H]);
  });

  it("rejects a downward bad print too", () => {
    const flat = Array(10).fill(100);
    const series = buildCloseSeries(candles([...flat, 20, 99]), 0, 11 * H);
    expect(series.closes.slice(-2)).toEqual([100, 99]);
  });

  it("accepts a jump that holds for 3 hours as a real move", () => {
    const flat = Array(10).fill(100);
    const series = buildCloseSeries(candles([...flat, 130, 131, 132, 133]), 0, 13 * H);
    expect(series.closes.slice(-4)).toEqual([100, 100, 132, 133]);
    expect(series.rejected).toEqual([10 * H, 11 * H]);
  });

  it("does not judge outliers with too little history", () => {
    const series = buildCloseSeries(candles([100, 100, 300]), 0, 2 * H);
    expect(series.closes).toEqual([100, 100, 300]);
  });

  it("uses candles before the window to warm up the filter", () => {
    // Hours 0-9 are history before the window; hour 10 is a spike at the window start.
    const series = buildCloseSeries(candles([...Array(10).fill(100), 400, 100]), 10 * H, 11 * H);
    expect(series.closes).toEqual([100, 100]);
    expect(series.rejected).toEqual([10 * H]);
  });

  it("does not let gradual moves trip the filter", () => {
    const rising = Array.from({ length: 48 }, (_, i) => 100 * 1.004 ** i); // +0.4% an hour
    const series = buildCloseSeries(candles(rising), 0, 47 * H);
    expect(series.rejected).toEqual([]);
  });
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
