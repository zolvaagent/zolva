import { describe, expect, it } from "vitest";
import { z } from "zod";

import { paramRows } from "./schema";

describe("paramRows", () => {
  it("lists every input with its type, range, whether it is required and its description", () => {
    const rows = paramRows({
      id: z.string().uuid().describe("The id"),
      venue: z.enum(["spot", "perps"]).optional().describe("Venue"),
      capital: z.number().min(1000).max(1_000_000).describe("Money"),
      stopLossPct: z.number().int().min(2).max(25).optional(),
      markets: z.array(z.string().max(42)).min(1).max(14),
      confirm: z.boolean().optional(),
    });
    expect(rows).toEqual([
      { name: "id", type: "string (uuid)", required: true, description: "The id" },
      { name: "venue", type: "one of: spot, perps", required: false, description: "Venue" },
      { name: "capital", type: "number, 1,000 to 1,000,000", required: true, description: "Money" },
      { name: "stopLossPct", type: "integer, 2 to 25", required: false, description: "" },
      { name: "markets", type: "array of string, up to 42 characters (1 to 14)", required: true, description: "" },
      { name: "confirm", type: "boolean", required: false, description: "" },
    ]);
  });
});
