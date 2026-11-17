import { describe, expect, it } from "vitest";

import { BACKTEST_HOURS, hoursNeeded, hoursText, tooNewReason } from "./history";

describe("Studio history needs", () => {
  it("lets DCA use a market from its first priced hour", () => {
    expect(hoursNeeded(true, 0)).toBe(1);
    expect(hoursNeeded(false, 48)).toBe(BACKTEST_HOURS + 48);
    expect(hoursNeeded(false, 1201)).toBe(BACKTEST_HOURS + 1201);
  });

  it("says why in hours, then days", () => {
    expect(hoursText(1)).toBe("1 hour");
    expect(hoursText(36)).toBe("36 hours");
    expect(hoursText(768)).toBe("32 days");
    expect(tooNewReason("ANT", 6, 768, "Momentum")).toBe("ANT has 6 hours of prices. Momentum needs 32 days (a 30 day backtest plus its rule's history). DCA can use it now.");
    expect(tooNewReason("ANT", 0, 768, "Momentum")).toBe("ANT has no price yet.");
  });
});
