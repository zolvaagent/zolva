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

/**
 * Zolva's own real money agent and its trading wallet, public so anyone can check the live
 * trades on chain (docs/verify, the landing roadmap). Real money is owner only for now.
 */
export const LIVE_PROOF_AGENT_ID = "5e977d7d-be98-4fc0-98b9-7e4d166ce9c6";
export const LIVE_PROOF_HREF = `/agents/${LIVE_PROOF_AGENT_ID}`;
export const LIVE_TRADING_WALLET = "0x235c3ccea156dfbbc31ee37c07a7292c4506f628";
