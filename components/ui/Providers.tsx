"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import type { PrivyHandle } from "@/components/ui/PrivyIsland";
import { shortAddress } from "@/lib/format";
import { hasInjectedWallet, signInWithWallet, WalletError } from "@/lib/wallet-client";

type Auth = {
  /** Signed-in wallet address (lowercase) or null. */
  address: string | null;
  /** Opens the login modal; `then` runs after a successful login. */
  openLogin: (then?: () => void) => void;
  logout: () => Promise<void>;
  /** The loaded Privy island, or null before it loads (used by the owner-only live signer page). */
  privy: () => PrivyHandle | null;
};

const AuthContext = createContext<Auth | null>(null);
const ToastContext = createContext<(message: string) => void>(() => {});

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth outside Providers");
  return auth;
};
export const useToast = () => useContext(ToastContext);

type ProvidersProps = { initialAddress: string | null; privyAppId: string | null; children: ReactNode };

// Browser only: see PrivyIsland.
const PrivyIsland = dynamic(() => import("@/components/ui/PrivyIsland"), { ssr: false });

export function Providers({ initialAddress, privyAppId, children }: ProvidersProps) {
  const privyEnabled = Boolean(privyAppId);
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginRef = useRef<HTMLDialogElement>(null);
  const afterLogin = useRef<(() => void) | null>(null);
  const [loginState, setLoginState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // Filled in once the Privy island has loaded.
  const privy = useRef<PrivyHandle | null>(null);
  const onPrivyReady = useCallback((handle: PrivyHandle) => {
    privy.current = handle;
  }, []);

  const toast = useCallback((message: string) => {
    setToastText(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2600);
  }, []);

  const openLogin = useCallback((then?: () => void) => {
    afterLogin.current = then ?? null;
    setLoginState({ busy: false, error: null });
    loginRef.current?.showModal();
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await privy.current?.logout().catch(() => {});
    setAddress(null);
    toast("Logged out");
    router.push("/");
    router.refresh();
  }, [router, toast]);

  const finishLogin = (signedIn: string) => {
    setAddress(signedIn);
    setLoginState({ busy: false, error: null });
    loginRef.current?.close();
    toast(`Logged in as ${shortAddress(signedIn)}`);
    router.refresh();
    afterLogin.current?.();
    afterLogin.current = null;
  };

  const connectWallet = async () => {
    setLoginState({ busy: true, error: null });
    try {
      finishLogin(await signInWithWallet());
    } catch (cause) {
      const message = cause instanceof WalletError ? cause.message : "Sign in failed. Please try again.";
      setLoginState({ busy: false, error: message || null });
    }
  };

  const onPrivyFailure = useCallback((message: string | null) => {
    setLoginState({ busy: false, error: message });
    if (message) loginRef.current?.showModal();
  }, []);

  // Privy draws its own window, so ours closes while it is open and comes
  // back only if something went wrong.
  const continueWithEmail = () => {
    if (!privy.current) return onPrivyFailure("Email and Google sign in is still loading. Please try again in a moment.");
    loginRef.current?.close();
    privy.current.login();
  };

  const onPrivyAccessToken = async (accessToken: string) => {
    const response = await fetch("/api/auth/privy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { address?: string; error?: string } | null;
    if (response?.ok && body?.address) return finishLogin(body.address);
    // Our session failed (blocked country, server error): end the Privy one too.
    await privy.current?.logout().catch(() => {});
    onPrivyFailure(body?.error ?? "Sign in failed. Please try again.");
  };

  // Whether the browser has a wallet extension; false while rendering on the server.
  const walletDetected = useSyncExternalStore(
    () => () => {},
    hasInjectedWallet,
    () => false,
  );

  return (
    <AuthContext.Provider value={{ address, openLogin, logout, privy: () => privy.current }}>
      <ToastContext.Provider value={toast}>
        {children}

        <dialog
          ref={loginRef}
          className="modal modal--privy"
          aria-labelledby="login-title"
          onClick={(event) => {
            if (event.target === loginRef.current) loginRef.current?.close();
          }}
        >
          <div className="privy">
            <button className="privy__icon-button privy__close" type="button" aria-label="Close" onClick={() => loginRef.current?.close()}>
              <i className="ph ph-x" />
            </button>
            {loginState.busy ? (
              <>
                <span className="privy__pulse">
                  <img src="/img/brand/zolva-mark.png" alt="" width={56} height={56} />
                </span>
                <h2 className="privy__title" id="login-title">
                  Confirm in your wallet
                </h2>
                <p className="privy__text">Approve the connection, then sign the message. It is free and uses no gas.</p>
              </>
            ) : (
              <>
                <img className="privy__logo" src="/img/brand/zolva-mark.png" alt="" width={56} height={56} />
                <h2 className="privy__title" id="login-title">
                  Log in or sign up
                </h2>
                {privyEnabled && (
                  <button className="privy__option" type="button" onClick={continueWithEmail}>
                    <span className="privy__glyph" style={{ background: "var(--color-purple-8)", color: "var(--color-purple-rich)" }}>
                      <i className="ph ph-envelope-simple" />
                    </span>
                    Continue with email or Google
                    <i className="ph ph-caret-right privy__chevron" />
                  </button>
                )}
                <button className="privy__option" type="button" onClick={connectWallet}>
                  <span className="privy__glyph" style={{ background: "var(--color-purple-8)", color: "var(--color-purple-rich)" }}>
                    <i className="ph ph-wallet" />
                  </span>
                  Continue with a wallet
                  {walletDetected ? (
                    <span className="pill" style={{ marginLeft: "auto" }}>
                      Detected
                    </span>
                  ) : (
                    <i className="ph ph-caret-right privy__chevron" />
                  )}
                </button>
                {loginState.error && <span className="field-error">{loginState.error}</span>}
                <p className="privy__note">
                  {privyEnabled
                    ? "Email and Google accounts get a wallet automatically. Browser wallets like MetaMask and Rabby work too. Signing in is free and never moves funds."
                    : "MetaMask, Rabby, Coinbase Wallet and other browser wallets work. Signing in is free and never moves funds. Email and Google sign in are coming soon."}
                </p>
              </>
            )}
          </div>
        </dialog>

        {privyAppId && <PrivyIsland appId={privyAppId} onReady={onPrivyReady} onAccessToken={onPrivyAccessToken} onFailure={onPrivyFailure} />}

        <div className={`toast${toastText ? " is-visible" : ""}`} role="status" aria-live="polite">
          {toastText}
        </div>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
