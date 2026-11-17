"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { DEFAULT_BIO } from "@/components/app/TrenchCreate";
import { useAuth } from "@/components/ui/Providers";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { hasInjectedWallet, sendFromBrowserWallet, WalletError } from "@/lib/wallet-client";

type AgentForSetup = {
  id: string;
  name: string;
  status: "setup" | "active" | "paused" | "halted" | "closed";
  walletAddress: string | null;
  onRushr: boolean;
  setupDone: boolean;
  rushrHandle: string | null;
  budgetUsd: number;
};

const noSubscription = () => () => {};

type WalletStatus = { eth: number; ethUsd: number; startNeedsEth: number } | null;

async function post(agentId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/trench/agents/${agentId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "That did not work. Please try again.");
  return result;
}

/**
 * One trench agent's setup and controls. The server makes the wallet and the Rushr profile (no
 * Privy popups); here the user finishes a setup that stopped half way, funds the wallet, then
 * starts, pauses, sells everything or withdraws.
 */
export function TrenchSetup({ agent }: { agent: AgentForSetup }) {
  const router = useRouter();
  const { privy, address } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletStatus>(null);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState(DEFAULT_BIO);
  // null until the user types: the field then shows the suggested amount.
  const [typedEth, setTypedEth] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Rabby, MetaMask...: only known in the browser, never on the server render.
  const browserWallet = useSyncExternalStore(noSubscription, hasInjectedWallet, () => false);

  const refreshWallet = useCallback(() => {
    if (!agent.walletAddress) return;
    fetch(`/api/trench/agents/${agent.id}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ wallet: WalletStatus }>) : null))
      .then((body) => body && setWallet(body.wallet))
      .catch(() => {});
  }, [agent.id, agent.walletAddress]);
  useEffect(refreshWallet, [refreshWallet]);

  const funded = Boolean(wallet && wallet.eth >= wallet.startNeedsEth);
  // While it waits for a deposit, check the balance every 15 seconds.
  useEffect(() => {
    if (funded || agent.status === "closed" || !agent.walletAddress) return;
    const timer = setInterval(refreshWallet, 15_000);
    return () => clearInterval(timer);
  }, [funded, agent.status, agent.walletAddress, refreshWallet]);

  // Suggest the whole budget in ETH plus a little for gas and Rushr's fees.
  const suggestedEth = wallet ? Math.ceil((agent.budgetUsd / wallet.ethUsd + 0.0005) * 10_000) / 10_000 : null;
  const fundEth = typedEth ?? (suggestedEth !== null ? String(suggestedEth) : "");

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      router.refresh();
      refreshWallet();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const finishSetup = () => run("setup", async () => void (await post(agent.id, { step: "setup", handle, bio })));
  const step = (name: string) => run(name, async () => void (await post(agent.id, { step: name })));

  const weiToSend = () => {
    const amount = Number(fundEth);
    if (!(amount > 0)) throw new Error("Enter an amount of ETH.");
    return BigInt(Math.round(amount * 1e9)) * 10n ** 9n;
  };

  const fundFromZolva = () =>
    run("fund", async () => {
      const bridge = privy();
      if (!bridge || !address || !agent.walletAddress) throw new Error("Log in with email or Google to send from your Zolva wallet.");
      await bridge.sendTransaction(address, agent.walletAddress, "0x", weiToSend());
    });

  // Rabby, MetaMask or any browser wallet: switches it to Robinhood Chain, then a plain ETH transfer.
  const fundFromBrowser = () =>
    run("browser", async () => {
      if (!agent.walletAddress) return;
      try {
        await sendFromBrowserWallet(agent.walletAddress, "0x", "Sending the ETH failed. Check the wallet has ETH on Robinhood Chain, then try again.", weiToSend());
      } catch (cause) {
        // An empty message means the prompt was closed: nothing to show.
        if (cause instanceof WalletError && !cause.message) return;
        throw cause;
      }
    });

  const copyAddress = async () => {
    if (!agent.walletAddress) return;
    try {
      await navigator.clipboard.writeText(agent.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed. Select the address and copy it by hand.");
    }
  };

  const withdraw = () =>
    run("withdraw", async () => {
      if (!window.confirm("Send all ETH in the agent wallet back to your Zolva wallet and close this agent for good?")) return;
      await post(agent.id, { step: "withdraw" });
    });

  const walletLink = agent.walletAddress ? (
    <a className="text-link" href={`${EXPLORER_URL}/address/${agent.walletAddress}`} target="_blank" rel="noopener noreferrer">
      {shortAddress(agent.walletAddress)}
    </a>
  ) : null;
  return (
    <section className="card trench-setup" aria-label="Setup and controls">
      <h2 className="card__title">{agent.status === "setup" ? "Set it up" : "Controls"}</h2>

      <ol className="trench-steps">
        <li className={agent.setupDone ? "trench-steps__done" : ""}>
          <strong>1. Wallet and Rushr profile</strong>
          {agent.setupDone ? (
            <span className="muted">
              Its own wallet {walletLink}, yours, where Zolva may only trade and send funds back to your Zolva wallet. On Rushr as{" "}
              <a className="text-link" href={`https://app.rushr.trade/u/${agent.rushrHandle}`} target="_blank" rel="noopener noreferrer">
                @{agent.rushrHandle}
              </a>
              .
            </span>
          ) : (
            <>
              <span className="muted">The setup stopped half way. Finish it here{agent.onRushr ? "" : " (pick the Rushr handle again)"}.</span>
              {agent.onRushr ? null : (
                <>
                  <label className="trench-field">
                    <span>Handle (3 to 20: a-z, 0-9, _)</span>
                    <input className="input" value={handle} maxLength={20} onChange={(event) => setHandle(event.target.value.toLowerCase())} />
                  </label>
                  <label className="trench-field">
                    <span>Bio ({bio.length}/160)</span>
                    <input className="input" value={bio} maxLength={160} onChange={(event) => setBio(event.target.value)} />
                  </label>
                </>
              )}
              <button className="button button--primary" type="button" disabled={Boolean(busy) || (!agent.onRushr && handle.length < 3)} onClick={() => void finishSetup()}>
                {busy === "setup" ? "Setting up…" : "Finish setup"}
              </button>
            </>
          )}
        </li>

        {agent.walletAddress && agent.status !== "closed" ? (
          <li className={funded ? "trench-steps__done" : ""}>
            <strong>2. Fund it</strong>
            <span className="muted">
              The agent trades from its own wallet, so the ETH has to be there; Zolva never holds it, and you can withdraw what is left whenever it holds no tokens.{" "}
              {wallet ? `Now ${wallet.eth.toFixed(5)} ETH (about $${(wallet.eth * wallet.ethUsd).toFixed(2)}); it can start from ${wallet.startNeedsEth.toFixed(4)} ETH.` : "Loading the balance…"}
            </span>
            <div className="trench-address">
              <code>{agent.walletAddress}</code>
              <button className="button button--ghost button--small" type="button" onClick={() => void copyAddress()}>
                <i className={`ph ${copied ? "ph-check" : "ph-copy"}`} aria-hidden="true" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <span className="muted trenches-small">Send ETH on Robinhood Chain (chain 4663) from any wallet that is not a Rushr member. The balance updates by itself.</span>
            <div className="trench-inline">
              <label className="trench-amount">
                <input className="input" type="number" min="0" step="0.0001" value={fundEth} onChange={(event) => setTypedEth(event.target.value)} aria-label="ETH to send" />
                <span>ETH</span>
              </label>
              {browserWallet ? (
                <button className="button button--primary" type="button" disabled={Boolean(busy)} onClick={() => void fundFromBrowser()}>
                  {busy === "browser" ? "Confirm in your wallet…" : "Send with Rabby / MetaMask"}
                </button>
              ) : null}
              {privy() ? (
                <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => void fundFromZolva()}>
                  {busy === "fund" ? "Sending…" : "Send from my Zolva wallet"}
                </button>
              ) : null}
            </div>
          </li>
        ) : null}
      </ol>

      <div className="trench-inline">
        {agent.status === "setup" || agent.status === "paused" ? (
          <button className="button button--primary" type="button" disabled={Boolean(busy) || !agent.setupDone} onClick={() => void step(agent.status === "setup" ? "start" : "resume")}>
            {busy === "start" || busy === "resume" ? "…" : agent.status === "setup" ? "Start trading" : "Resume"}
          </button>
        ) : null}
        {agent.status === "active" ? (
          <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => void step("pause")}>
            Pause buying
          </button>
        ) : null}
        {agent.status === "active" || agent.status === "paused" ? (
          <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => window.confirm("Sell every token this agent holds on the next minute and stop it for good?") && void step("sell_all")}>
            Sell everything and stop
          </button>
        ) : null}
        {agent.status !== "active" && agent.status !== "closed" && agent.walletAddress ? (
          <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => void withdraw()}>
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw and close"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="loss" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
