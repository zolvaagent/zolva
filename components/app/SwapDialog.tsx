"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";

import { useAuth } from "@/components/ui/Providers";
import { Select, type SelectOption } from "@/components/ui/Select";
import { EXPLORER_URL } from "@/lib/chain";
import { price as formatPrice } from "@/lib/format";
import { approveCall, DEFAULT_SLIPPAGE_BPS, PRICE_WARNING_BPS, SWAP_ROUTER_02, swapCall, USDG, type SwapQuote, type SwapToken } from "@/lib/swap";
import { hasInjectedWallet, sendFromBrowserWallet, WalletError } from "@/lib/wallet-client";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SLIPPAGE_OPTIONS: SelectOption<number>[] = [
  { value: 50, label: "0.5% slippage" },
  { value: 100, label: "1% slippage" },
  { value: 200, label: "2% slippage" },
];

/** A fixed sale for "Sell position": the market and the quantity, sold for USDG. */
export type SwapPreset = { token: Hex; amount: string; title: string; note: string };

type Props = {
  address: string;
  loginMethod: "privy" | "wallet" | null;
  /** Opens the dialog; the parent controls when. Ignored when inline. */
  open?: boolean;
  onClose?: () => void;
  /** Renders as a card on the page (/swap) instead of a dialog. */
  inline?: boolean;
  preset?: SwapPreset;
  /** Called with the swap's hash once it confirmed. */
  onSwapped?: (txHash: Hex) => Promise<void> | void;
};

/** Trims a raw token amount to at most `digits` decimals for display. */
function display(raw: string | bigint, decimals: number, digits = 6): string {
  const [whole, fraction = ""] = formatUnits(BigInt(raw), decimals).split(".");
  const trimmed = fraction.slice(0, digits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/**
 * Swaps between USDG and one of Zolva's markets from the user's own wallet: a quote from
 * Uniswap's QuoterV2, an exact approval if needed, then SwapRouter02, each signed by the user
 * (Privy's window for email and Google accounts, the browser wallet otherwise).
 */
export function SwapDialog({ address, loginMethod, open: openProp = false, onClose, preset, onSwapped, inline = false }: Props) {
  const open = inline || openProp;
  const { privy } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tokens, setTokens] = useState<SwapToken[] | null>(null);
  const [side, setSide] = useState<"buy" | "sell">(preset ? "sell" : "buy");
  const [market, setMarket] = useState<Hex | null>(preset?.token ?? null);
  const [amount, setAmount] = useState(preset?.amount ?? "");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  // Quotes and the price warning are tied to the inputs they were made for, so changing an
  // input drops them without resetting state in an effect.
  const [result, setResult] = useState<{ key: string; quote: SwapQuote | null; error: string | null } | null>(null);
  const [acceptedKey, setAcceptedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Hex | null>(null);

  useEffect(() => {
    if (inline) return;
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open, inline]);

  useEffect(() => {
    if (!open || tokens) return;
    fetch("/api/swap")
      .then((response) => (response.ok ? (response.json() as Promise<{ tokens: SwapToken[] }>) : Promise.reject()))
      .then((body) => {
        setTokens(body.tokens);
        setMarket((current) => current ?? body.tokens.find((token) => token.symbol === "ETH")?.address ?? body.tokens[1]?.address ?? null);
      })
      .catch(() => setError("Loading the token list failed. Close and try again."));
  }, [open, tokens]);

  const usdg = tokens?.find((token) => token.address === USDG) ?? null;
  const other = tokens?.find((token) => token.address === market) ?? null;
  const tokenIn = side === "buy" ? usdg : other;
  const tokenOut = side === "buy" ? other : usdg;

  let amountIn: bigint | null = null;
  try {
    amountIn = tokenIn && Number(amount) > 0 ? parseUnits(amount, tokenIn.decimals) : null;
  } catch {
    amountIn = null;
  }

  const requestQuote = useCallback(async () => {
    if (!tokenIn || !tokenOut || amountIn === null) return null;
    const response = await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amountIn.toString(), slippageBps }),
    });
    const body = (await response.json().catch(() => ({}))) as SwapQuote & { error?: string };
    if (!response.ok) throw new WalletError(body.error ?? "No quote right now. Try again.");
    return body;
  }, [tokenIn, tokenOut, amountIn, slippageBps]);

  const key = `${side}|${market}|${amount}|${slippageBps}`;
  const current = result?.key === key ? result : null;
  const quote = current?.quote ?? null;
  const quoting = amountIn !== null && current === null;
  const accepted = acceptedKey === key;

  // A fresh quote half a second after the inputs settle.
  useEffect(() => {
    if (!open || done || busy || amountIn === null) return;
    const timer = setTimeout(() => {
      requestQuote()
        .then((next) => setResult({ key, quote: next, error: null }))
        .catch((cause: Error) => setResult({ key, quote: null, error: cause.message }));
    }, 500);
    return () => clearTimeout(timer);
    // amountIn is derived from amount; depend on the inputs, not the bigint object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, done]);

  const close = () => {
    if (busy) return;
    setDone(null);
    setError(null);
    onClose?.();
  };

  // On the page: start a new swap after one went through.
  const again = () => {
    setDone(null);
    setError(null);
    setAmount("");
  };

  // Email and Google accounts sign in Privy's window; wallet logins in the browser wallet.
  const send = async (to: Hex, data: Hex): Promise<Hex> => {
    if (loginMethod === "privy") {
      const handle = privy();
      if (!handle) throw new WalletError("The secure wallet window is still loading. Try again in a moment.");
      // Our dialog sits in the top layer; close it so Privy's window is visible, then reopen.
      if (!inline) dialog.current?.close();
      try {
        return await handle.sendTransaction(address, to, data);
      } finally {
        if (!inline) dialog.current?.showModal();
      }
    }
    if (!hasInjectedWallet()) throw new WalletError("Open Zolva in a browser with your wallet (MetaMask, Rabby or Coinbase Wallet) to swap.");
    const accounts = (await window.ethereum!.request({ method: "eth_requestAccounts" })) as string[];
    if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw new WalletError("Switch your wallet to the account you logged in with, then try again.");
    return sendFromBrowserWallet(to, data, "The wallet did not send the transaction. Check you have a little ETH for gas, then try again.");
  };

  const waitFor = async (hash: Hex, what: string) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const body = (await fetch(`/api/swap?tx=${hash}`).then((response) => response.json())) as { status?: string };
      if (body.status === "confirmed") return;
      if (body.status === "failed") throw new WalletError(`The ${what} failed on chain. Nothing was swapped.`);
      await pause(2000);
    }
    throw new WalletError(`The ${what} is taking long to confirm. Check it on Blockscout before trying again.`);
  };

  const swap = async () => {
    if (!tokenIn || !tokenOut || amountIn === null || !quote) return;
    setError(null);
    try {
      if (BigInt(quote.allowance ?? "0") < amountIn) {
        setBusy(`Approve ${tokenIn.symbol} in your wallet…`);
        const approval = await send(tokenIn.address, approveCall(amountIn));
        setBusy("Waiting for the approval…");
        await waitFor(approval, "approval");
      }
      // Re-quote right before signing, so the minimum reflects the price now.
      setBusy("Getting a fresh quote…");
      const fresh = await requestQuote();
      if (!fresh) return;
      setBusy("Confirm the swap in your wallet…");
      const hash = await send(SWAP_ROUTER_02, swapCall({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, fee: fresh.fee, recipient: address as Hex, amountIn, minOut: BigInt(fresh.minOut) }));
      setBusy("Waiting for the swap…");
      await waitFor(hash, "swap");
      setResult({ key, quote: fresh, error: null });
      setDone(hash);
      if (onSwapped) {
        setBusy("Updating the agent…");
        await onSwapped(hash);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      // An empty message means the user closed the wallet prompt.
      if (message && !message.includes("rejected")) setError(message);
    } finally {
      setBusy(null);
    }
  };

  const balance = quote?.balance ?? null;
  const short = balance !== null && amountIn !== null && BigInt(balance) < amountIn;
  const farFromClose = quote?.deviationBps != null && quote.deviationBps > PRICE_WARNING_BPS;
  const marketOptions: SelectOption<Hex>[] = (tokens ?? []).filter((token) => token.address !== USDG).map((token) => ({ value: token.address, label: token.symbol, hint: token.name }));
  const canSwap = Boolean(quote) && !short && !quoting && !busy && (!farFromClose || accepted);

  const body = (
    <div className={inline ? "stack" : "modal__body"}>
      {!inline && (
        <>
          <span className="choice__glyph" aria-hidden="true">
            <i className="ph ph-arrows-left-right" />
          </span>
          <h2 className="modal__title" id="swap-title">
            {preset?.title ?? "Swap"}
          </h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: "20px" }}>
            {preset?.note ?? "Swap from your own wallet on Uniswap, Robinhood Chain. You sign it; Zolva never holds your tokens."}
          </p>
        </>
      )}
      {!preset && (
        <div className="tabs" role="tablist" aria-label="Buy or sell" style={{ width: "fit-content" }}>
          {(["buy", "sell"] as const).map((key) => (
            <button key={key} className="tab" role="tab" type="button" aria-selected={side === key} onClick={() => setSide(key)} disabled={Boolean(busy)}>
              {key === "buy" ? "Buy with USDG" : "Sell for USDG"}
            </button>
          ))}
        </div>
      )}

      {!preset && marketOptions.length > 0 && market && <Select variant="block" value={market} options={marketOptions} onChange={setMarket} label="Market" />}

      <label className="ai-limit__field">
        <span className="ai-limit__label">
          {tokenIn ? `${tokenIn.symbol} to ${side === "buy" ? "spend" : "sell"}` : "Amount"}
          {balance !== null && tokenIn && (
            <button className="text-link" type="button" style={{ marginLeft: 8, fontSize: 12 }} onClick={() => setAmount(formatUnits(BigInt(balance), tokenIn.decimals))} disabled={Boolean(busy) || Boolean(preset)}>
              Balance {display(balance, tokenIn.decimals)}
            </button>
          )}
        </span>
        <input className="input" inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} disabled={Boolean(busy) || Boolean(preset)} />
      </label>

      <Select variant="block" value={slippageBps} options={SLIPPAGE_OPTIONS} onChange={setSlippageBps} label="Slippage" />

      <div className="stack stack--tight" style={{ fontSize: 14, lineHeight: "20px" }}>
        <div className="growth__row" style={{ padding: 0, border: 0 }}>
          <span className="muted">You get about</span>
          <strong>{quoting ? "Quoting…" : quote && tokenOut ? `${display(quote.amountOut, tokenOut.decimals)} ${tokenOut.symbol}` : "—"}</strong>
        </div>
        {quote && tokenOut && (
          <>
            <div className="growth__row" style={{ padding: 0, border: 0 }}>
              <span className="muted">At least</span>
              <span>
                {display(quote.minOut, tokenOut.decimals)} {tokenOut.symbol}
              </span>
            </div>
            <div className="growth__row" style={{ padding: 0, border: 0 }}>
              <span className="muted">Price</span>
              <span>
                {formatPrice(quote.price)} per {other?.symbol} · pool fee {(quote.fee / 10_000).toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </div>

      {short && <p className="field-error">Your wallet holds less than this amount.</p>}
      {farFromClose && (
        <label className="check" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={accepted} onChange={(event) => setAcceptedKey(event.target.checked ? key : null)} />
          <span>
            This price is {((quote?.deviationBps ?? 0) / 100).toFixed(1)}% away from the latest hourly close. Swap anyway.
          </span>
        </label>
      )}
      <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
        Needs a little ETH on Robinhood Chain for gas. A first swap of a token asks for an exact approval first, then the swap.
      </p>
      {(error ?? current?.error) && (
        <p className="field-error" role="alert">
          {error ?? current?.error}
        </p>
      )}
      {done && (
        <a className="text-link" href={`${EXPLORER_URL}/tx/${done}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
          Swapped. View it on Blockscout
        </a>
      )}
      <div className="modal__actions">
        {inline ? (
          done && (
            <button className="button button--ghost" type="button" onClick={again}>
              New swap
            </button>
          )
        ) : (
          <button className="button button--ghost" type="button" onClick={close} disabled={Boolean(busy)}>
            {done ? "Close" : "Cancel"}
          </button>
        )}
        {!done && (
          <button className="button button--primary" type="button" onClick={swap} disabled={!canSwap}>
            {busy ?? (quote && amountIn !== null && BigInt(quote.allowance ?? "0") < amountIn ? `Approve and ${side}` : side === "buy" ? "Buy" : "Sell")}
          </button>
        )}
      </div>
    </div>
  );

  if (inline) return <div className="card swap-card">{body}</div>;

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="swap-title"
      onCancel={(event) => {
        // Escape key. Closing for Privy's window is programmatic and does not fire this.
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      {body}
    </dialog>
  );
}

/**
 * "Sell" on a live agent's holding (owner only): sells the position for USDG from the
 * agent's trading wallet, signed by the owner, then records it on the agent so its
 * positions and cash keep matching the wallet.
 */
export function SellPositionButton({ agentId, wallet, loginMethod, token, symbol, quantity }: { agentId: string; wallet: string; loginMethod: "privy" | "wallet" | null; token: string; symbol: string; quantity: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Rounded down to 8 decimals so the amount never exceeds what the wallet holds.
  const amount = (Math.floor(quantity * 1e8) / 1e8).toFixed(8).replace(/\.?0+$/, "");
  const record = async (txHash: Hex) => {
    const response = await fetch("/api/live/manual-sell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, txHash }) });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new WalletError(body.error ?? "The swap went through, but recording it on the agent failed. Try again in a minute.");
    router.refresh();
  };
  return (
    <>
      <button className="button button--ghost button--small" type="button" onClick={() => setOpen(true)}>
        Sell
      </button>
      {open && (
        <SwapDialog
          address={wallet}
          loginMethod={loginMethod}
          open
          onClose={() => setOpen(false)}
          preset={{ token: token.toLowerCase() as Hex, amount, title: `Sell ${symbol}`, note: `Sells this agent's ${symbol} for USDG from its trading wallet. You sign the swap; the sale is then recorded on the agent with the reason "manual".` }}
          onSwapped={record}
        />
      )}
    </>
  );
}
