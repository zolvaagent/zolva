"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import type { PrivyHandle } from "@/components/ui/PrivyIsland";
import { shortAddress } from "@/lib/format";
import { hasInjectedWallet, signInWithWallet, WalletError } from "@/lib/wallet-client";
import { track } from "@/lib/funnel";

/**
 * Extra options for the login window. `skipTo` also offers "Look around first", which closes it
 * and opens that page without logging in. `source` names where it opened, for the funnel's
 * login_dismiss event. `heading` and `note` replace the generic title and add a line under it
 * (the Studio names the agent and says paper trading is free). `onDismiss` runs when the window
 * is closed without a login.
 */
export type LoginOptions = { skipTo?: string; source?: string; heading?: string; note?: string; onDismiss?: () => void };

type Auth = {
  /** Signed-in wallet address (lowercase) or null. */
  address: string | null;
  /** Opens the login modal; `then` runs after a successful login. See LoginOptions. */
  openLogin: (then?: () => void, options?: LoginOptions) => void;
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
  const [loginOptions, setLoginOptions] = useState<LoginOptions>({});
  // The option tried in this login ("privy" or "wallet"), for login_dismiss; null until one is picked.
  const loginAttempt = useRef<string | null>(null);
  const dismissRef = useRef<{ source: string; onDismiss?: () => void } | null>(null);
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

  const openLogin = useCallback((then?: () => void, options?: LoginOptions) => {
    afterLogin.current = then ?? null;
    loginAttempt.current = null;
    dismissRef.current = { source: options?.source ?? "site", onDismiss: options?.onDismiss };
    setLoginOptions(options ?? {});
    setLoginState({ busy: false, error: null });
    loginRef.current?.showModal();
  }, []);

  /** The visitor gave up on this login: record it once and tell the caller. */
  const dismissLogin = useCallback(() => {
    const pending = dismissRef.current;
    if (!pending) return;
    dismissRef.current = null;
    track("login_dismiss", `${pending.source} ${loginAttempt.current ?? "none"}`);
    pending.onDismiss?.();
  }, []);

  /** Closes our login window because the visitor closed it (button, backdrop or Escape). */
  const closeLogin = () => {
    loginRef.current?.close();
    dismissLogin();
  };

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
    // login_ok is recorded by the login route on the server (lib/funnel-server.ts).
    dismissRef.current = null;
    router.refresh();
    afterLogin.current?.();
    afterLogin.current = null;
  };

  const connectWallet = async () => {
    loginAttempt.current = "wallet";
    setLoginState({ busy: true, error: null });
    try {
      finishLogin(await signInWithWallet());
    } catch (cause) {
      const message = cause instanceof WalletError ? cause.message : "Sign in failed. Please try again.";
      setLoginState({ busy: false, error: message || null });
    }
  };

  const onPrivyFailure = useCallback(
    (message: string | null) => {
      setLoginState({ busy: false, error: message });
      if (message) loginRef.current?.showModal();
      // No message: the visitor closed Privy's window, which ends this login.
      else dismissLogin();
    },
    [dismissLogin],
  );

  // Privy draws its own window, so ours closes while it is open and comes
  // back only if something went wrong.
  const continueWithEmail = () => {
    loginAttempt.current = "privy";
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
            if (event.target === loginRef.current) closeLogin();
          }}
          // Escape closes the dialog by itself; only the funnel step is left to record.
          onCancel={dismissLogin}
        >
          <div className="privy">
            <button className="privy__icon-button privy__close" type="button" aria-label="Close" onClick={closeLogin}>
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
                  {loginOptions.heading ?? "Log in or sign up"}
                </h2>
                {loginOptions.note && <p className="privy__text privy__lead">{loginOptions.note}</p>}
                {privyEnabled && (
                  <button className={`privy__option${loginOptions.heading ? " privy__option--main" : ""}`} type="button" onClick={continueWithEmail}>
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
                {loginOptions.skipTo && (
                  <button
                    className="text-link privy__skip"
                    type="button"
                    onClick={() => {
                      const target = loginOptions.skipTo;
                      closeLogin();
                      if (target) router.push(target);
                    }}
                  >
                    Look around first, log in later
                  </button>
                )}
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
