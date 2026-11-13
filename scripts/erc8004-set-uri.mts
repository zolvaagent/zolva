/**
 * Sends setAgentURI(agentId, agentURI) for Zolva's ERC-8004 identity with the same live URI, so
 * indexers such as 8004scan re-read the registration file (for example after it gained the agentId).
 * Signed by the swap-fee wallet that owns the identity (SWAP_FEE_WALLET_KEY in .dev.vars, never
 * printed). Owner only, run by hand:
 *
 *   npm run erc8004:set-uri                 dry run: owner check, simulation, gas estimate
 *   npm run erc8004:set-uri -- --execute    sends the transaction and prints the URIUpdated event
 */
import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, decodeEventLog, defineChain, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ERC8004_AGENT_ID, ERC8004_AGENT_URI, IDENTITY_REGISTRY, ROBINHOOD_CHAIN_ID } from "../lib/erc8004.ts";

const REGISTRY_ABI = [
  { type: "function", name: "setAgentURI", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "newURI", type: "string" }], outputs: [] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string" }] },
  { type: "event", name: "URIUpdated", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "newURI", type: "string", indexed: false }, { name: "updatedBy", type: "address", indexed: true }] },
] as const;

if (ERC8004_AGENT_ID === null) throw new Error("ERC8004_AGENT_ID is not set in lib/erc8004.ts");
const agentId = BigInt(ERC8004_AGENT_ID);

const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
const rpcUrl = text.match(/^ROBINHOOD_RPC_URL=(.*)$/m)?.[1].trim();
const key = text.match(/^SWAP_FEE_WALLET_KEY=(0x[0-9a-f]{64})\s*$/m)?.[1] as Hex | undefined;
if (!rpcUrl || !key) throw new Error("ROBINHOOD_RPC_URL and SWAP_FEE_WALLET_KEY must be set in .dev.vars");

const account = privateKeyToAccount(key);
const robinhood = defineChain({ id: ROBINHOOD_CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const chain = createPublicClient({ chain: robinhood, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpcUrl) });
const registry = IDENTITY_REGISTRY as Hex;
const execute = process.argv.includes("--execute");

// The file must be live and already carry this agentId, or a re-index gains nothing.
const live = (await fetch(ERC8004_AGENT_URI)
  .then((response) => (response.ok ? response.json() : null))
  .catch(() => null)) as { registrations?: { agentId?: number }[] } | null;
if (!live?.registrations?.some((entry) => entry.agentId === ERC8004_AGENT_ID)) throw new Error(`${ERC8004_AGENT_URI} does not list agentId ${ERC8004_AGENT_ID} yet`);

const [chainId, eth, owner, currentUri] = await Promise.all([
  chain.getChainId(),
  chain.getBalance({ address: account.address }),
  chain.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "ownerOf", args: [agentId] }),
  chain.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "tokenURI", args: [agentId] }),
]);
if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`RPC is on chain ${chainId}, expected ${ROBINHOOD_CHAIN_ID}`);
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`Agent ${agentId} is owned by ${owner}, not this wallet`);

// Simulation fails here if the function or permissions differ from what we expect.
await chain.simulateContract({ address: registry, abi: REGISTRY_ABI, functionName: "setAgentURI", args: [agentId, ERC8004_AGENT_URI], account });
const gas = await chain.estimateContractGas({ address: registry, abi: REGISTRY_ABI, functionName: "setAgentURI", args: [agentId, ERC8004_AGENT_URI], account });
const gasPrice = await chain.getGasPrice();

console.log(`Wallet       ${account.address} (owner of agent ${agentId})`);
console.log(`ETH          ${formatEther(eth)}`);
console.log(`Current URI  ${currentUri}`);
console.log(`New URI      ${ERC8004_AGENT_URI}`);
console.log(`Gas estimate ${gas} ≈ ${formatEther(gas * gasPrice)} ETH (plus a small L1 data fee)`);

if (eth < gas * gasPrice * 3n) throw new Error("Not enough ETH for gas.");
if (!execute) {
  console.log("\nDry run. Add -- --execute to send setAgentURI().");
  process.exit(0);
}

const hash = await wallet.writeContract({ address: registry, abi: REGISTRY_ABI, functionName: "setAgentURI", args: [agentId, ERC8004_AGENT_URI] });
const receipt = await chain.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`setAgentURI() failed on chain: ${hash}`);
let updated = false;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
  try {
    const event = decodeEventLog({ abi: REGISTRY_ABI, data: log.data, topics: log.topics });
    if (event.eventName === "URIUpdated") updated = true;
  } catch {
    // Other logs from the same call.
  }
}
console.log(`\nSent. tx ${hash}`);
console.log(`URIUpdated event ${updated ? "found" : "not found in logs, check the tx on Blockscout"}`);
