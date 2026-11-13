/**
 * Registers Zolva in the ERC-8004 Identity Registry on Robinhood Chain, signed by Zolva's swap-fee
 * wallet (SWAP_FEE_WALLET_KEY in .dev.vars, never printed). Owner only, run once by hand:
 *
 *   npm run erc8004:register                 dry run: wallet, ETH, existing identities, gas estimate
 *   npm run erc8004:register -- --execute    sends register(agentURI) and prints the new agentId
 *
 * The agentURI is the live registration file (lib/erc8004.ts). The fee wallet becomes the NFT owner
 * and the registry's default agentWallet. It refuses to send if this wallet already owns an
 * identity, so a second run cannot register Zolva twice. After it: set ERC8004_AGENT_ID in
 * lib/erc8004.ts and redeploy (docs/erc8004.md).
 */
import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, decodeEventLog, defineChain, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ERC8004_AGENT_URI, IDENTITY_REGISTRY, ROBINHOOD_CHAIN_ID } from "../lib/erc8004.ts";

const REGISTRY_ABI = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "event", name: "Registered", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "agentURI", type: "string", indexed: false }, { name: "owner", type: "address", indexed: true }] },
] as const;

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

// The registry must serve this exact file before it is referenced on chain.
const live = (await fetch(ERC8004_AGENT_URI)
  .then((response) => (response.ok ? response.json() : null))
  .catch(() => null)) as { type?: string } | null;
if (live?.type !== "https://eips.ethereum.org/EIPS/eip-8004#registration-v1") throw new Error(`${ERC8004_AGENT_URI} is not serving the registration file`);

const [chainId, eth, owned] = await Promise.all([
  chain.getChainId(),
  chain.getBalance({ address: account.address }),
  chain.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "balanceOf", args: [account.address] }),
]);
if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`RPC is on chain ${chainId}, expected ${ROBINHOOD_CHAIN_ID}`);
const gas = await chain.estimateContractGas({ address: registry, abi: REGISTRY_ABI, functionName: "register", args: [ERC8004_AGENT_URI], account });
const gasPrice = await chain.getGasPrice();

console.log(`Wallet          ${account.address}`);
console.log(`ETH             ${formatEther(eth)}`);
console.log(`Identities held ${owned}`);
console.log(`agentURI        ${ERC8004_AGENT_URI}`);
console.log(`Gas estimate    ${gas} at ${formatEther(gasPrice * 1_000_000_000n)} gwei ≈ ${formatEther(gas * gasPrice)} ETH (plus a small L1 data fee)`);

if (owned > 0n) throw new Error("This wallet already owns an ERC-8004 identity; not registering again.");
if (eth < gas * gasPrice * 3n) throw new Error("Not enough ETH for gas.");
if (!execute) {
  console.log("\nDry run. Add -- --execute to send register().");
  process.exit(0);
}

const hash = await wallet.writeContract({ address: registry, abi: REGISTRY_ABI, functionName: "register", args: [ERC8004_AGENT_URI] });
const receipt = await chain.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`register() failed on chain: ${hash}`);
let agentId: bigint | null = null;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
  try {
    const event = decodeEventLog({ abi: REGISTRY_ABI, data: log.data, topics: log.topics });
    if (event.eventName === "Registered") agentId = event.args.agentId;
  } catch {
    // Transfer and MetadataSet logs from the same call.
  }
}
console.log(`\nRegistered. tx ${hash}`);
console.log(`agentId ${agentId ?? "not found in logs, read it from the tx on Blockscout"}`);
