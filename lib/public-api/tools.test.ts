import { describe, expect, it } from "vitest";

import type { PublicAgent } from "./format";
import { filterAgents, filterByAssetClass, filterTrades } from "./tools";

const agent = (id: string, strategy: string, markets: string[], returnPct: number, vsHoldingPts: number, maxDrawdownPct: number) =>
  ({ id, strategy, markets, returnPct, vsHoldingPts, maxDrawdownPct }) as PublicAgent;

const agents = [
  agent("a", "momentum", ["NVDA", "TSLA"], 2, -1, 5),
  agent("b", "dip_hunter", ["NVDA", "ETH", "BTC"], 1, 6, 2),
  agent("c", "spike_fade", ["ETH", "BTC"], 3, 4, 8),
];

describe("filterAgents", () => {
  it("sorts by return by default", () => {
    expect(filterAgents(agents, {}).map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by lead over holding, or by the smallest worst drop", () => {
    expect(filterAgents(agents, { sortBy: "vs_holding" }).map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(filterAgents(agents, { sortBy: "drawdown" }).map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("filters by strategy and by market, ignoring the symbol's case", () => {
    expect(filterAgents(agents, { strategy: "spike_fade" }).map((item) => item.id)).toEqual(["c"]);
    expect(filterAgents(agents, { market: "eth" }).map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("limits the count without changing the input", () => {
    expect(filterAgents(agents, { limit: 1 })).toHaveLength(1);
    expect(agents.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("filterByAssetClass", () => {
  it("keeps everything without a class, otherwise only that class", () => {
    const markets = [{ symbol: "NVDA", assetClass: "stock" }, { symbol: "ETH", assetClass: "crypto" }];
    expect(filterByAssetClass(markets)).toHaveLength(2);
    expect(filterByAssetClass(markets, "crypto").map((market) => market.symbol)).toEqual(["ETH"]);
  });
});

describe("filterTrades", () => {
  const trades = [
    { market: "ETH", agentId: "a1" },
    { market: "NVDA", agentId: "a1" },
    { market: "ETH", agentId: "b2" },
  ];

  it("filters by market and agent and keeps the order", () => {
    expect(filterTrades(trades, { market: "eth" })).toEqual([trades[0], trades[2]]);
    expect(filterTrades(trades, { agentId: "A1" })).toEqual([trades[0], trades[1]]);
    expect(filterTrades(trades, { limit: 1 })).toEqual([trades[0]]);
  });
});
