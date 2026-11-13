/**
 * Zolva's ERC-8004 identity (eips.ethereum.org/EIPS/eip-8004, Draft): the registration file the
 * Identity Registry's agentURI points to. Served at /.well-known/agent-registration.json, which is
 * both the agentURI and the spec's endpoint-domain verification path, so one file covers both.
 *
 * Registration is one owner-signed `register(agentURI)` call on the Identity Registry on Robinhood
 * Chain (see docs/erc8004.md). Until then ERC8004_AGENT_ID is null and `registrations` is empty;
 * after it, set the agentId here and redeploy so the file matches the chain.
 *
 * It describes Zolva itself (one identity), not each user's agent. Keep the description factual:
 * agents are rule based, paper trade by default, perps are paper only.
 */

export const SITE = "https://zolvaagent.app";
export const ERC8004_AGENT_URI = `${SITE}/.well-known/agent-registration.json`;

/** Canonical Identity Registry (same CREATE2 address on every chain; live on Robinhood Chain 4663). */
export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const ROBINHOOD_CHAIN_ID = 4663;

/** Set after the owner's register() transaction; null until then. */
export const ERC8004_AGENT_ID: number | null = null;

export function registrationFile() {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Zolva",
    description:
      "Zolva builds no-code trading agents for Robinhood Chain: tokenized US stocks, ETH and BTC, and Lighter perps. Each agent follows rules you set, is backtested on the last 30 days before it starts, and paper trades every hour with a reason for every buy, sell and hold. Perps are paper only. Read-only MCP server and public REST API; paid API calls settle in USDG over x402. Stock tokens are not available to US persons.",
    image: `${SITE}/img/brand/zolva-mark.png`,
    services: [
      { name: "web", endpoint: `${SITE}/` },
      { name: "MCP", endpoint: `${SITE}/mcp`, version: "2025-06-18" },
      { name: "REST", endpoint: `${SITE}/api/public/v1` },
      { name: "x402", endpoint: `${SITE}/api/x402/v1` },
    ],
    x402Support: true,
    active: true,
    registrations: ERC8004_AGENT_ID === null ? [] : [{ agentId: ERC8004_AGENT_ID, agentRegistry: `eip155:${ROBINHOOD_CHAIN_ID}:${IDENTITY_REGISTRY}` }],
    supportedTrust: ["reputation"],
  };
}
