"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

type AgentForSetup = {
  id: string;
  name: string;
  status: "setup" | "active" | "paused" | "halted" | "closed";
  walletAddress: string | null;
  onRushr: boolean;
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
 * Setup and controls for one trench agent: own wallet (Zolva's signer under the agent's policy),
 * Rushr sign-up signed by the user, funding, then start, pause, sell everything and withdraw.
 */
export function TrenchSetup({ agent }: { agent: AgentForSetup }) {
  const router = useRouter();
  const { privy, address } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletStatus>(null);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("Rule-based memecoin agent. Runs on Zolva (zolvaagent.app). Not advice.");
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

  // Email and Google logins have a Privy bridge; plain wallet logins can't make agent wallets.
  const needsPrivy = !privy();

  const makeWallet = () =>
    run("wallet", async () => {
      const bridge = privy();
      if (!bridge) throw new Error("Trench agents need the wallet Zolva makes for you. Log in with email or Google.");
      const walletAddress = await bridge.createAgentWallet();
      const plan = (await post(agent.id, { step: "wallet_prepare", walletAddress })) as { signerId: string; policyId: string };
      await bridge.addSigner(walletAddress, plan.signerId, [plan.policyId]);
      await post(agent.id, { step: "wallet_confirm", walletAddress, policyId: plan.policyId });
    });

  const joinRushr = () =>
    run("rushr", async () => {
      const bridge = privy();
      if (!bridge || !agent.walletAddress) throw new Error("Set up the agent wallet first.");
      const { message } = (await post(agent.id, { step: "rushr_nonce", handle })) as { message: string };
      const signature = await bridge.signMessage(agent.walletAddress, message);
      await post(agent.id, { step: "rushr_register", message, signature, handle, displayName: agent.name, bio });
    });

  const fund = () =>
    run("fund", async () => {
      const bridge = privy();
      const amount = Number(fundEth);
      if (!bridge || !address || !agent.walletAddress) throw new Error("Log in with email or Google to send from your Zolva wallet.");
      if (!(amount > 0)) throw new Error("Enter an amount of ETH.");
      await bridge.sendTransaction(address, agent.walletAddress, "0x", BigInt(Math.round(amount * 1e9)) * 10n ** 9n);
      setFundEth("");
    });

  const step = (name: string) => () => run(name, async () => void (await post(agent.id, { step: name })));

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
      {needsPrivy && agent.status === "setup" ? <p className="loss">Trench agents need the wallet Zolva makes for you. Log out, then log in with email or Google.</p> : null}

      <ol className="trench-steps">
        <li className={agent.walletAddress ? "trench-steps__done" : ""}>
          <strong>1. Its own wallet</strong>
          {agent.walletAddress ? (
            <span className="muted">Wallet {walletLink}. Zolva can only trade from it and send funds back to your Zolva wallet.</span>
          ) : (
            <>
              <span className="muted">Privy makes a second wallet for you and asks you to let Zolva trade from it under strict rules.</span>
              <button className="button button--primary" type="button" disabled={Boolean(busy) || needsPrivy} onClick={() => void makeWallet()}>
                {busy === "wallet" ? "Setting up…" : "Create the agent wallet"}
              </button>
            </>
          )}
        </li>

        <li className={agent.onRushr ? "trench-steps__done" : ""}>
          <strong>2. On Rushr</strong>
          {agent.onRushr ? (
            <span className="muted">
              Listed as{" "}
              <a className="text-link" href={`https://app.rushr.trade/u/${agent.rushrHandle}`} target="_blank" rel="noopener noreferrer">
                @{agent.rushrHandle}
              </a>
              .
            </span>
          ) : (
            <>
              <span className="muted">You sign Rushr&apos;s sign-in message with the agent wallet. The profile is public and permanent.</span>
              <label className="trench-field">
                <span>Handle (3 to 20: a-z, 0-9, _)</span>
                <input className="input" value={handle} maxLength={20} onChange={(event) => setHandle(event.target.value.toLowerCase())} disabled={!agent.walletAddress} />
              </label>
              <label className="trench-field">
                <span>Bio ({bio.length}/160)</span>
                <input className="input" value={bio} maxLength={160} onChange={(event) => setBio(event.target.value)} disabled={!agent.walletAddress} />
              </label>
              <button className="button button--primary" type="button" disabled={Boolean(busy) || !agent.walletAddress || handle.length < 3} onClick={() => void joinRushr()}>
                {busy === "rushr" ? "Signing up…" : "Sign and register on Rushr"}
              </button>
            </>
          )}
        </li>

        {agent.walletAddress && agent.status !== "closed" ? (
          <li className={wallet && wallet.eth >= wallet.startNeedsEth ? "trench-steps__done" : ""}>
            <strong>3. Fund it</strong>
            <span className="muted">
              {wallet ? `${wallet.eth.toFixed(5)} ETH (about $${(wallet.eth * wallet.ethUsd).toFixed(2)}). Starting needs at least ${wallet.startNeedsEth.toFixed(4)} ETH.` : "Loading the balance…"} Send ETH on Robinhood Chain to {walletLink}, or from your Zolva wallet here.
            </span>
            <div className="trench-inline">
              <input className="input" type="number" min="0" step="0.001" placeholder="ETH" value={fundEth} onChange={(event) => setFundEth(event.target.value)} />
              <button className="button button--ghost" type="button" disabled={Boolean(busy) || needsPrivy} onClick={() => void fund()}>
                {busy === "fund" ? "Sending…" : "Send from my Zolva wallet"}
              </button>
            </div>
          </li>
        ) : null}
      </ol>

      <div className="trench-inline">
        {agent.status === "setup" || agent.status === "paused" ? (
          <button className="button button--primary" type="button" disabled={Boolean(busy) || !agent.walletAddress || !agent.onRushr} onClick={() => void step(agent.status === "setup" ? "start" : "resume")()}>
            {busy ? "…" : agent.status === "setup" ? "Start trading" : "Resume"}
          </button>
        ) : null}
        {agent.status === "active" ? (
          <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => void step("pause")()}>
            Pause buying
          </button>
        ) : null}
        {agent.status === "active" || agent.status === "paused" ? (
          <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => window.confirm("Sell every token this agent holds on the next minute and stop it for good?") && void step("sell_all")()}>
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
