"use client";

import { getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";

import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";

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
    throw new WalletError("No wallet found in this browser. Install MetaMask, Rabby or Coinbase Wallet, or open Sita in your wallet's browser.");
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
      statement: "Sign in to Sita. This is free and does not send a transaction.",
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
