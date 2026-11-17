"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DEFAULT_BIO } from "@/components/app/TrenchCreate";
import { useAuth } from "@/components/ui/Providers";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

type AgentForSetup = {
  id: string;
  name: string;
  status: "setup" | "active" | "paused" | "halted" | "closed";
  walletAddress: string | null;
  onRushr: boolean;
  setupDone: boolean;
  rushrHandle: string | null;
};

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
  const [fundEth, setFundEth] = useState("");

  const refreshWallet = useCallback(() => {
    if (!agent.walletAddress) return;
    fetch(`/api/trench/agents/${agent.id}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ wallet: WalletStatus }>) : null))
      .then((body) => body && setWallet(body.wallet))
      .catch(() => {});
  }, [agent.id, agent.walletAddress]);
  useEffect(refreshWallet, [refreshWallet]);

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

  const fund = () =>
    run("fund", async () => {
      const bridge = privy();
      const amount = Number(fundEth);
      if (!bridge || !address || !agent.walletAddress) throw new Error("Log in with email or Google to send from your Zolva wallet, or send ETH from any wallet.");
      if (!(amount > 0)) throw new Error("Enter an amount of ETH.");
      await bridge.sendTransaction(address, agent.walletAddress, "0x", BigInt(Math.round(amount * 1e9)) * 10n ** 9n);
      setFundEth("");
    });

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
  const funded = Boolean(wallet && wallet.eth >= wallet.startNeedsEth);

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
              {wallet ? `${wallet.eth.toFixed(5)} ETH (about $${(wallet.eth * wallet.ethUsd).toFixed(2)}). Starting needs at least ${wallet.startNeedsEth.toFixed(4)} ETH.` : "Loading the balance…"} Send ETH on Robinhood Chain to{" "}
              <code>{agent.walletAddress}</code>, from any wallet that is not a Rushr member, or from your Zolva wallet here.
            </span>
            <div className="trench-inline">
              <input className="input" type="number" min="0" step="0.001" placeholder="ETH" value={fundEth} onChange={(event) => setFundEth(event.target.value)} />
              <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => void fund()}>
                {busy === "fund" ? "Sending…" : "Send from my Zolva wallet"}
              </button>
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
