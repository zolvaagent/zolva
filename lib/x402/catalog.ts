/**
 * The premium API's endpoints and prices, shared by the routes, the free index at
 * /api/x402/v1 and the docs page, so a price is written once.
 */
export const PREMIUM_ENDPOINTS = {
  scan: {
    method: "GET",
    path: "/api/x402/v1/scan",
    price: "0.005",
    description: "Every Zolva market at the latest hourly close: change, 48 hour z-score, 14 hour RSI and trend, deepest dip first.",
  },
  backtest: {
    method: "POST",
    path: "/api/x402/v1/backtest",
    price: "0.03",
    description: "Replay a strategy on up to 3 Zolva markets over the last 1 to 30 days with Zolva's engine, compared with holding.",
  },
} as const;
