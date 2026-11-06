"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";

import { useAuth } from "@/components/ui/Providers";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { EXPLORER_URL } from "@/lib/chain";
import { usd } from "@/lib/format";
import { approveCall, DEFAULT_SLIPPAGE_BPS, isDirect, PRICE_WARNING_BPS, SWAP_ROUTER_02, swapCall, USDG, type SwapQuote, type SwapToken } from "@/lib/swap";
import { hasInjectedWallet, sendFromBrowserWallet, WalletError } from "@/lib/wallet-client";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SLIPPAGES = [50, 100, 200] as const;
/** Below this much ETH (wei) a swap probably cannot pay its gas. */
const LOW_GAS_WEI = 10n ** 13n;

/** A fixed sale for "Sell position": the market and the quantity, sold for USDG. */
export type SwapPreset = { token: Hex; amount: string; title: string; note: string };

type Props = {
  /** The logged in wallet, or null (the card then offers Log in). */
  address: string | null;
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

type Listing = { tokens: SwapToken[]; balances: Record<string, string> | null; ethWei: string | null };

/** A raw token amount for display, at most `digits` decimals. */
function display(raw: string | bigint, decimals: number, digits = 6): string {
  const [whole, fraction = ""] = formatUnits(BigInt(raw), decimals).split(".");
  const trimmed = fraction.slice(0, digits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** USD value of a raw amount at the token's latest hourly close; null without one. */
function usdValue(token: SwapToken | null, raw: string | bigint | null): number | null {
  if (!token || raw === null || token.lastClose === null) return null;
  return (Number(raw) / 10 ** token.decimals) * token.lastClose;
}

/**
 * Swaps any two of Zolva's tokens from the user's own wallet: Sell on top, Buy below, a
 * quote from Uniswap's QuoterV2, an exact approval if needed, then SwapRouter02 (one hop on a
 * USDG pool, or two through USDG), each signed by the user in Privy's window or the browser
 * wallet. Balances come from the logged in wallet.
 */
export function SwapDialog({ address, loginMethod, open: openProp = false, onClose, preset, onSwapped, inline = false }: Props) {
  const open = inline || openProp;
  const { privy, openLogin } = useAuth();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const picker = useRef<HTMLDialogElement>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [sellToken, setSellToken] = useState<Hex | null>(preset?.token ?? USDG);
  const [buyToken, setBuyToken] = useState<Hex | null>(preset ? USDG : null);
  const [amount, setAmount] = useState(preset?.amount ?? "");
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [settings, setSettings] = useState(false);
  const [picking, setPicking] = useState<"sell" | "buy" | null>(null);
  const [search, setSearch] = useState("");
  // Quotes and the price warning are tied to the inputs they were made for, so changing an
  // input drops them without resetting state in an effect.
  const [result, setResult] = useState<{ key: string; quote: SwapQuote | null; error: string | null } | null>(null);
  const [acceptedKey, setAcceptedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Hex | null>(null);

  // The token list with the wallet's balances; loaded on open and again after a swap.
  const [listingVersion, setListingVersion] = useState(0);

  useEffect(() => {
    if (inline) return;
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open, inline]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/swap")
      .then((response) => (response.ok ? (response.json() as Promise<Listing>) : Promise.reject()))
      .then((body) => {
        setListing(body);
        setBuyToken((current) => current ?? body.tokens.find((token) => token.symbol === "ETH")?.address ?? body.tokens[1]?.address ?? null);
      })
      .catch(() => setError("Loading the tokens failed. Refresh and try again."));
  }, [open, address, listingVersion]);

  useEffect(() => {
    if (picking) picker.current?.showModal();
    else picker.current?.close();
  }, [picking]);

  const tokens = listing?.tokens ?? [];
  const tokenIn = tokens.find((token) => token.address === sellToken) ?? null;
  const tokenOut = tokens.find((token) => token.address === buyToken) ?? null;
  const balanceOf = (token: SwapToken | null) => (token && listing?.balances ? (listing.balances[token.address] ?? "0") : null);

  let amountIn: bigint | null = null;
  try {
    amountIn = tokenIn && Number(amount) > 0 ? parseUnits(amount, tokenIn.decimals) : null;
  } catch {
    amountIn = null;
  }

  const requestQuote = async () => {
    if (!tokenIn || !tokenOut || amountIn === null || tokenIn.address === tokenOut.address) return null;
    const response = await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amountIn.toString(), slippageBps }),
    });
    const body = (await response.json().catch(() => ({}))) as SwapQuote & { error?: string };
    if (!response.ok) throw new WalletError(body.error ?? "No quote right now. Try again.");
    return body;
  };

  const key = `${sellToken}|${buyToken}|${amount}|${slippageBps}`;
  const current = result?.key === key ? result : null;
  const quote = current?.quote ?? null;
  const quoting = amountIn !== null && current === null;
  const accepted = acceptedKey === key;

  // A fresh quote half a second after the inputs settle.
  useEffect(() => {
    if (!open || done || busy || amountIn === null || !tokenOut) return;
    const timer = setTimeout(() => {
      requestQuote()
        .then((next) => setResult({ key, quote: next, error: null }))
        .catch((cause: Error) => setResult({ key, quote: null, error: cause.message }));
    }, 500);
    return () => clearTimeout(timer);
    // amountIn and tokenOut follow from the key's inputs; depend on the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, done]);

  const close = () => {
    if (busy) return;
    setDone(null);
    setError(null);
    onClose?.();
  };

  const flip = () => {
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setAmount("");
  };

  const pick = (address: Hex) => {
    // Picking the token already on the other side swaps the two sides.
    if (picking === "sell") {
      if (address === buyToken) setBuyToken(sellToken);
      setSellToken(address);
      setAmount("");
    } else if (picking === "buy") {
      if (address === sellToken) setSellToken(buyToken);
      setBuyToken(address);
    }
    setPicking(null);
    setSearch("");
  };

  // Email and Google accounts sign in Privy's window; wallet logins in the browser wallet.
  const send = async (to: Hex, data: Hex): Promise<Hex> => {
    if (!address) throw new WalletError("Log in first.");
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
    if (!address || !tokenIn || !tokenOut || amountIn === null || !quote) return;
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
      const hash = await send(SWAP_ROUTER_02, swapCall({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, fees: fresh.fees, recipient: address as Hex, amountIn, minOut: BigInt(fresh.minOut) }));
      setBusy("Waiting for the swap…");
      await waitFor(hash, "swap");
      setResult({ key, quote: fresh, error: null });
      setDone(hash);
      if (onSwapped) {
        setBusy("Updating the agent…");
        await onSwapped(hash);
      }
      setListingVersion((version) => version + 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      // An empty message means the user closed the wallet prompt.
      if (message && !message.includes("rejected")) setError(message);
    } finally {
      setBusy(null);
    }
  };

  const sellBalance = balanceOf(tokenIn);
  const buyBalance = balanceOf(tokenOut);
  const short = sellBalance !== null && amountIn !== null && BigInt(sellBalance) < amountIn;
  const lowGas = listing?.ethWei != null && BigInt(listing.ethWei) < LOW_GAS_WEI;
  const farFromClose = quote?.deviationBps != null && quote.deviationBps > PRICE_WARNING_BPS;
  const needsApproval = quote !== null && amountIn !== null && BigInt(quote.allowance ?? "0") < amountIn;
  const sellUsd = usdValue(tokenIn, amountIn);
  const buyUsd = usdValue(tokenOut, quote?.amountOut ?? null);
  const locked = Boolean(preset);

  const setFraction = (share: 2n | 1n) => {
    if (!tokenIn || sellBalance === null) return;
    setAmount(formatUnits(BigInt(sellBalance) / share, tokenIn.decimals));
  };

  let action: { label: string; disabled: boolean; onClick?: () => void };
  if (!address) action = { label: "Log in to swap", disabled: false, onClick: () => openLogin(() => router.refresh()) };
  else if (busy) action = { label: busy, disabled: true };
  else if (amountIn === null) action = { label: "Enter an amount", disabled: true };
  else if (short) action = { label: `Not enough ${tokenIn?.symbol}`, disabled: true };
  else if (lowGas) action = { label: "Needs a little ETH for gas", disabled: true };
  else if (quoting || !quote) action = { label: quoting ? "Getting a quote…" : "No quote", disabled: true };
  else if (farFromClose && !accepted) action = { label: "Confirm the price below", disabled: true };
  else action = { label: needsApproval ? `Approve ${tokenIn?.symbol} and swap` : "Swap", disabled: false, onClick: swap };

  const query = search.trim().toLowerCase();
  const pickList = tokens
    .filter((token) => !query || token.symbol.toLowerCase().includes(query) || token.name.toLowerCase().includes(query) || token.address === query)
    .map((token) => ({ token, balance: balanceOf(token), value: usdValue(token, balanceOf(token)) }))
    // What the wallet holds first, by value; then the rest by symbol.
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.token.symbol.localeCompare(b.token.symbol));

  const tokenButton = (token: SwapToken | null, side: "sell" | "buy") => (
    <button className="swapbox__token" type="button" onClick={() => setPicking(side)} disabled={locked || Boolean(busy)} aria-label={`${side === "sell" ? "Sell" : "Buy"} token: ${token?.symbol ?? "pick one"}`}>
      {token ? <TickerAvatar symbol={token.symbol} size={28} /> : <span className="swapbox__token-empty" />}
      <strong>{token?.symbol ?? "Select"}</strong>
      {!locked && <i className="ph ph-caret-down" aria-hidden="true" />}
    </button>
  );

  const body = (
    <div className="swapbox">
      <div className="swapbox__head">
        <strong className="swapbox__title">{preset?.title ?? "Swap"}</strong>
        <button className="swapbox__settings" type="button" onClick={() => setSettings((value) => !value)} aria-expanded={settings} aria-label="Slippage settings">
          <span>{slippageBps / 100}% slippage</span>
          <i className="ph ph-sliders-horizontal" aria-hidden="true" />
        </button>
      </div>
      {preset && <p className="muted swapbox__note">{preset.note}</p>}
      {settings && (
        <div className="swapbox__slippage" role="group" aria-label="Slippage">
          <span className="muted">Max slippage</span>
          {SLIPPAGES.map((value) => (
            <button key={value} className="swapbox__chip" type="button" aria-pressed={slippageBps === value} onClick={() => setSlippageBps(value)}>
              {value / 100}%
            </button>
          ))}
        </div>
      )}

      <section className="swapbox__panel" aria-label="Sell">
        <div className="swapbox__row">
          <span className="swapbox__label">Sell</span>
          {sellBalance !== null && tokenIn && (
            <span className="swapbox__balance">
              <i className="ph ph-wallet" aria-hidden="true" /> {display(sellBalance, tokenIn.decimals)} {tokenIn.symbol}
              {!locked && (
                <>
                  <button className="swapbox__chip" type="button" onClick={() => setFraction(2n)} disabled={Boolean(busy)}>
                    Half
                  </button>
                  <button className="swapbox__chip" type="button" onClick={() => setFraction(1n)} disabled={Boolean(busy)}>
                    Max
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        <div className="swapbox__row">
          <input
            className="swapbox__amount"
            inputMode="decimal"
            placeholder="0.0"
            aria-label="Amount to sell"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            disabled={locked || Boolean(busy)}
          />
          {tokenButton(tokenIn, "sell")}
        </div>
        <span className="swapbox__usd">{sellUsd !== null ? `≈ ${usd(sellUsd)}` : " "}</span>
      </section>

      {!locked && (
        <button className="swapbox__flip" type="button" onClick={flip} disabled={Boolean(busy)} aria-label="Swap the two tokens">
          <i className="ph ph-arrows-down-up" aria-hidden="true" />
        </button>
      )}

      <section className="swapbox__panel swapbox__panel--buy" aria-label="Buy">
        <div className="swapbox__row">
          <span className="swapbox__label">Buy</span>
          {buyBalance !== null && tokenOut && (
            <span className="swapbox__balance">
              <i className="ph ph-wallet" aria-hidden="true" /> {display(buyBalance, tokenOut.decimals)} {tokenOut.symbol}
            </span>
          )}
        </div>
        <div className="swapbox__row">
          <output className={`swapbox__amount swapbox__amount--out${quote ? "" : " swapbox__amount--empty"}`} aria-live="polite">
            {quoting ? "…" : quote && tokenOut ? display(quote.amountOut, tokenOut.decimals) : "0.0"}
          </output>
          {tokenButton(tokenOut, "buy")}
        </div>
        <span className="swapbox__usd">{buyUsd !== null ? `≈ ${usd(buyUsd)}` : " "}</span>
      </section>

      {quote && tokenIn && tokenOut && (
        <dl className="swapbox__details">
          <div>
            <dt>Rate</dt>
            <dd>
              1 {tokenIn.symbol} = {quote.rate >= 1 ? quote.rate.toFixed(4) : quote.rate.toPrecision(4)} {tokenOut.symbol}
            </dd>
          </div>
          <div>
            <dt>Minimum received</dt>
            <dd>
              {display(quote.minOut, tokenOut.decimals)} {tokenOut.symbol}
            </dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>
              {isDirect(tokenIn, tokenOut) ? `${tokenIn.symbol} → ${tokenOut.symbol}` : `${tokenIn.symbol} → USDG → ${tokenOut.symbol}`} · Uniswap, fee{" "}
              {quote.fees.map((fee) => `${(fee / 10_000).toFixed(2)}%`).join(" + ")}
            </dd>
          </div>
        </dl>
      )}

      {farFromClose && (
        <label className="check swapbox__warning">
          <input type="checkbox" checked={accepted} onChange={(event) => setAcceptedKey(event.target.checked ? key : null)} />
          <span>This price is {((quote?.deviationBps ?? 0) / 100).toFixed(1)}% away from the latest hourly closes. Swap anyway.</span>
        </label>
      )}
      {(error ?? current?.error) && (
        <p className="field-error" role="alert">
          {error ?? current?.error}
        </p>
      )}
      {done ? (
        <div className="swapbox__done">
          <a className="text-link" href={`${EXPLORER_URL}/tx/${done}`} target="_blank" rel="noopener noreferrer">
            Swapped. View it on Blockscout <i className="ph ph-arrow-up-right" aria-hidden="true" />
          </a>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              if (!inline) return close();
              setDone(null);
              setAmount("");
            }}
          >
            {inline ? "New swap" : "Close"}
          </button>
        </div>
      ) : (
        <button className="button button--primary swapbox__action" type="button" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </button>
      )}
      {!inline && !done && (
        <button className="button button--ghost" type="button" onClick={close} disabled={Boolean(busy)}>
          Cancel
        </button>
      )}

      <dialog
        ref={picker}
        className="modal swapbox__picker"
        aria-label="Pick a token"
        onCancel={(event) => {
          event.preventDefault();
          setPicking(null);
        }}
        onClick={(event) => {
          if (event.target === picker.current) setPicking(null);
        }}
      >
        <div className="modal__body">
          <h2 className="modal__title">Select a token</h2>
          <label className="directory-search" style={{ width: "100%" }}>
            <span className="sr-only">Search tokens</span>
            <i className="ph ph-magnifying-glass" aria-hidden="true" />
            <input className="input" type="search" placeholder="Name, symbol or address" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <ul className="swapbox__list">
            {pickList.map(({ token, balance, value }) => (
              <li key={token.address}>
                <button type="button" className="swapbox__item" onClick={() => pick(token.address)} aria-current={(picking === "sell" ? sellToken : buyToken) === token.address ? "true" : undefined}>
                  <TickerAvatar symbol={token.symbol} size={36} />
                  <span className="swapbox__item-name">
                    <strong>{token.symbol}</strong>
                    <span className="muted">{token.name}</span>
                  </span>
                  {balance !== null && BigInt(balance) > 0n && (
                    <span className="swapbox__item-balance">
                      <strong>{display(balance, token.decimals, 4)}</strong>
                      {value !== null && <span className="muted">{usd(value)}</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!pickList.length && <li className="muted swapbox__empty">No token matches. Only Zolva&apos;s allowlisted tokens can be swapped.</li>}
          </ul>
        </div>
      </dialog>
    </div>
  );

  if (inline) return body;

  return (
    <dialog
      ref={dialog}
      className="modal swapbox-modal"
      aria-label={preset?.title ?? "Swap"}
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
