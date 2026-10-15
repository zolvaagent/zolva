"use client";

import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";

/**
 * Email and Google login through Privy, loaded in the browser only
 * (Providers imports this with `ssr: false`). That keeps Privy's large wallet
 * stack out of the server bundle. It renders nothing itself: it hands
 * login/logout to Providers, and Privy draws its own window when used.
 */

export type PrivyHandle = {
  login: () => void;
  logout: () => Promise<void>;
};

type PrivyIslandProps = {
  appId: string;
  onReady: (handle: PrivyHandle) => void;
  onAccessToken: (accessToken: string) => void;
  onFailure: (message: string | null) => void;
};

export default function PrivyIsland({ appId, ...bridge }: PrivyIslandProps) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "light", accentColor: "#8075ff", logo: "/img/icons/app.png" },
        // Email and Google users get a wallet, which becomes their account.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <PrivyBridge {...bridge} />
    </PrivyProvider>
  );
}

function PrivyBridge({ onReady, onAccessToken, onFailure }: Omit<PrivyIslandProps, "appId">) {
  const { ready, getAccessToken, logout } = usePrivy();
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
    });
  }, [onReady, onFailure, ready, login, logout]);

  return null;
}
