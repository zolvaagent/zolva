import { describe, expect, it } from "vitest";

import { buildConsensus, consensusNote, MIN_CONSENSUS_AGENTS, type ConsensusAgent } from "./consensus";

const agent = (id: string, markets: string[], extra: Partial<ConsensusAgent> = {}): ConsensusAgent => ({
  id,
  venue: markets[0].endsWith("-PERP") ? "perps" : "spot",
  markets,
  recordDays: 2,
  positions: {},
  lastHour: Object.fromEntries(markets.map((market) => [market, "hold"])),
  ...extra,
});

const agents = [
  agent("a", ["SOL-PERP"], { positions: { "SOL-PERP": "long" }, lastHour: { "SOL-PERP": "buy" }, recordDays: 2 }),
  agent("b", ["SOL-PERP"], { positions: { "SOL-PERP": "short" }, lastHour: { "SOL-PERP": "short" }, recordDays: 5 }),
  agent("c", ["SOL-PERP"], { lastHour: null, recordDays: 0 }),
  agent("d", ["BTC"], { positions: { BTC: "long" } }),
];

describe("buildConsensus", () => {
  it("counts long, short and flat agents and the newest hour's actions per market", () => {
    const [sol, btc] = buildConsensus(agents);
    expect(sol).toMatchObject({ market: "SOL-PERP", venue: "perps", agents: 3, long: 1, short: 1, flat: 1, enoughAgents: true, agentIds: ["a", "b", "c"], recordDays: { min: 0, max: 5 } });
    // c has no run in the newest hour, so it is not counted in lastHour.
    expect(sol.lastHour).toEqual({ buy: 1, sell: 0, short: 1, cover: 0, hold: 0 });
    expect(btc).toMatchObject({ market: "BTC", venue: "spot", agents: 1, long: 1, enoughAgents: false });
  });

  it("filters by market (any case) and venue", () => {
    expect(buildConsensus(agents, { market: "btc" }).map((row) => row.market)).toEqual(["BTC"]);
    expect(buildConsensus(agents, { venue: "spot" }).map((row) => row.market)).toEqual(["BTC"]);
    expect(buildConsensus(agents, { market: "NVDA" })).toEqual([]);
  });
});

describe("consensusNote", () => {
  it("says plainly when the counts are too few", () => {
    expect(consensusNote([], 4)).toMatch(/No Tested agent watches this market/);
    expect(consensusNote(buildConsensus(agents, { venue: "spot" }), 4)).toMatch(`fewer than ${MIN_CONSENSUS_AGENTS} agents: too few`);
    expect(consensusNote(buildConsensus(agents), 4)).toMatch(/1 of 2 markets/);
  });

  it("never uses signal wording", () => {
    const text = [consensusNote([], 0), consensusNote(buildConsensus(agents), 4)].join(" ");
    expect(text).not.toMatch(/signal|confidence|follow/i);
  });
});
