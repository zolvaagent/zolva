"use client";

import { encodeFunctionData, erc20Abi, getAddress, toHex } from "viem";
import { createSiweMessage } from "viem/siwe";

import { ROBINHOOD_CHAIN, ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { linkWalletMessage } from "@/lib/tiers";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export class WalletError extends Error {}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

/**
 * Sign-In with Ethereum through the browser's injected wallet (MetaMask,
 * Rabby, Coinbase Wallet, Brave). Signing is free: no transaction, no gas.
 * Resolves with the signed-in address; throws WalletError with a message for
 * the user, or an empty message when the user just closed the prompt.
 */
export async function signInWithWallet(): Promise<string> {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new WalletError("No wallet found in this browser. Install MetaMask, Rabby or Coinbase Wallet, or open Zolva in your wallet's browser.");
  }

  try {
    const [account] = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };

    const message = createSiweMessage({
      address: getAddress(account),
      chainId: ROBINHOOD_CHAIN_ID,
      domain: window.location.host,
      uri: window.location.origin,
      nonce,
      version: "1",
      statement: "Sign in to Zolva. This is free and does not send a transaction.",
      expirationTime: new Date(Date.now() + 10 * 60 * 1000),
    });
    const signature = await ethereum.request({ method: "personal_sign", params: [message, account] });

    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    const body = (await response.json().catch(() => ({}))) as { address?: string; error?: string };
    if (!response.ok || !body.address) throw new WalletError(body.error ?? "Sign in failed. Please try again.");
    return body.address;
  } catch (cause) {
    if (cause instanceof WalletError) throw cause;
    // Code 4001: the user closed or rejected the wallet prompt.
    if ((cause as { code?: number }).code === 4001) throw new WalletError("");
    throw new WalletError("Sign in failed. Please try again.");
  }
}

/**
 * Lets the browser wallet's current account count its ZOLVA for the signed-in Zolva
 * account (linkWalletMessage: free, no transaction). Resolves with the server's new
 * membership state; throws WalletError like signInWithWallet.
 */
export async function linkExtraWallet<T>(account: string): Promise<T> {
  const ethereum = window.ethereum;
  if (!ethereum) throw new WalletError("No wallet found in this browser. Open Zolva in a browser with MetaMask, Rabby or Coinbase Wallet.");
  try {
    const [wallet] = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
    const signature = await ethereum.request({ method: "personal_sign", params: [linkWalletMessage(wallet, account, nonce), wallet] });
    const response = await fetch("/api/membership/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, signature }),
    });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new WalletError(body.error ?? "Adding the wallet failed. Please try again.");
    return body;
  } catch (cause) {
    if (cause instanceof WalletError) throw cause;
    if ((cause as { code?: number }).code === 4001) throw new WalletError("");
    throw new WalletError("Adding the wallet failed. Please try again.");
  }
}

/** The ERC-20 call that sends `raw` base units to the burn address. */
export function burnCall(burnAddress: string, raw: bigint): `0x${string}` {
  return encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [burnAddress as `0x${string}`, raw] });
}

/**
 * Sends one transaction from the browser wallet (MetaMask, Rabby...), switching it to
 * Robinhood Chain first. Resolves with the hash; throws WalletError (empty message when the
 * user closed the prompt). `failure` is the message for anything else.
 */
export async function sendFromBrowserWallet(to: string, data: `0x${string}`, failure: string): Promise<`0x${string}`> {
  const ethereum = window.ethereum;
  if (!ethereum) throw new WalletError("No wallet found in this browser.");
  try {
    const [from] = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const chainId = toHex(ROBINHOOD_CHAIN_ID);
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (cause) {
      // 4902: the wallet does not know Robinhood Chain yet.
      if ((cause as { code?: number }).code !== 4902) throw cause;
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId, chainName: ROBINHOOD_CHAIN.name, nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency, rpcUrls: ROBINHOOD_CHAIN.rpcUrls.default.http, blockExplorerUrls: [ROBINHOOD_CHAIN.blockExplorers.default.url] }],
      });
    }
    return (await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to, data }] })) as `0x${string}`;
  } catch (cause) {
    if (cause instanceof WalletError) throw cause;
    if ((cause as { code?: number }).code === 4001) throw new WalletError("");
    throw new WalletError(failure);
  }
}

/** Sends ZOLVA to the burn address from the browser wallet. Resolves with the transaction hash; throws WalletError. */
export async function sendBurnFromBrowserWallet(token: string, burnAddress: string, raw: bigint): Promise<`0x${string}`> {
  return sendFromBrowserWallet(token, burnCall(burnAddress, raw), "Sending the ZOLVA failed. Check you have ZOLVA and a little ETH for gas, then try again.");
}
