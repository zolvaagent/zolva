"use client";

import { PrivyProvider, useExportWallet, useLogin, usePrivy, useSendTransaction, useSigners } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";

import { useResolvedTheme } from "@/components/ui/ThemeToggle";
import { ROBINHOOD_CHAIN, ROBINHOOD_CHAIN_ID } from "@/lib/chain";

/**
 * Email and Google login through Privy, loaded in the browser only
 * (Providers imports this with `ssr: false`). That keeps Privy's large wallet
 * stack out of the server bundle. It renders nothing itself: it hands
 * login/logout to Providers, and Privy draws its own window when used.
 */

export type PrivyHandle = {
  login: () => void;
  logout: () => Promise<void>;
  /** Real money spike (owner only): lets Zolva's signer act on the embedded wallet under a policy. */
  addSigner: (address: string, signerId: string, policyIds: string[]) => Promise<void>;
  /** Removes every signer from the embedded wallet. */
  removeSigners: (address: string) => Promise<void>;
  /**
   * Opens Privy's own window with the embedded wallet's private key. The key is
   * shown in an iframe on Privy's domain, so Zolva never sees it. Throws when
   * the Privy session has ended (the user must log in with email or Google again).
   */
  exportWallet: (address: string) => Promise<void>;
  /** Sends a transaction from the embedded wallet on Robinhood Chain; Privy shows its own confirm window. */
  sendTransaction: (address: string, to: string, data: `0x${string}`) => Promise<`0x${string}`>;
};

type PrivyIslandProps = {
  appId: string;
  onReady: (handle: PrivyHandle) => void;
  onAccessToken: (accessToken: string) => void;
  onFailure: (message: string | null) => void;
};

export default function PrivyIsland({ appId, ...bridge }: PrivyIslandProps) {
  // Privy draws its own login window; keep it in the same theme as the page.
  const theme = useResolvedTheme();
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme, accentColor: "#8075ff", logo: "/img/brand/zolva-mark.png" },
        // Email and Google users get a wallet, which becomes their account.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        // Paying with ZOLVA sends a transaction on Robinhood Chain from the embedded wallet.
        defaultChain: ROBINHOOD_CHAIN,
        supportedChains: [ROBINHOOD_CHAIN],
      }}
    >
      <PrivyBridge {...bridge} />
    </PrivyProvider>
  );
}

function PrivyBridge({ onReady, onAccessToken, onFailure }: Omit<PrivyIslandProps, "appId">) {
  const { ready, getAccessToken, logout } = usePrivy();
  const { addSigners, removeSigners } = useSigners();
  const { exportWallet } = useExportWallet();
  const { sendTransaction } = useSendTransaction();
  // Only react to logins started from our modal.
  const pending = useRef(false);
  const { login } = useLogin({
    onComplete: async () => {
      if (!pending.current) return;
      pending.current = false;
      const accessToken = await getAccessToken();
      if (accessToken) onAccessToken(accessToken);
      else onFailure("Sign in failed. Please try again.");
    },
    onError: (code) => {
      if (!pending.current) return;
      pending.current = false;
      // Closing the Privy window is not an error worth showing.
      onFailure(code === "exited_auth_flow" ? null : "Sign in failed. Please try again.");
    },
  });

  useEffect(() => {
    onReady({
      login: () => {
        // Privy not loaded (blocked script, bad app ID): say so instead of doing nothing.
        if (!ready) return onFailure("Email and Google sign in is unavailable right now. Please use a wallet or try again later.");
        pending.current = true;
        login({ loginMethods: ["email", "google"] });
      },
      logout,
      addSigner: async (address, signerId, policyIds) => {
        await addSigners({ address, signers: [{ signerId, policyIds }] });
      },
      removeSigners: async (address) => {
        await removeSigners({ address });
      },
      exportWallet: async (address) => {
        await exportWallet({ address });
      },
      sendTransaction: async (address, to, data) => {
        const { hash } = await sendTransaction({ to, data, chainId: ROBINHOOD_CHAIN_ID }, { address });
        return hash;
      },
    });
  }, [onReady, onFailure, ready, login, logout, addSigners, removeSigners, exportWallet, sendTransaction]);

  return null;
}
