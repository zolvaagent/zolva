/** Robinhood Chain mainnet (Arbitrum Orbit L2). */
export const ROBINHOOD_CHAIN_ID = 4663;
export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

/**
 * Robinhood Chain for browser wallets (Privy, MetaMask): the official public RPC, which
 * is rate limited and meant for wallets. The server uses our own RPC (ROBINHOOD_RPC_URL).
 */
export const ROBINHOOD_CHAIN = {
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER_URL } },
} as const;
