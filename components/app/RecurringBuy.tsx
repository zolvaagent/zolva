"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { MIN_GAS_ETH, useLiveWallet } from "@/components/app/LiveSetup";
import { Select } from "@/components/ui/Select";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { useToast } from "@/components/ui/Providers";
import { dcaPlanError } from "@/lib/agents/copy";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress, usd } from "@/lib/format";

/** A market a real money agent can buy: an allowlisted spot token on a Uniswap v3 pool. */
export type RecurringToken = { address: string; symbol: string; name: string };

/** Least USDG per order (the database checks it too: agents_dca_plan). */
const MIN_ORDER_USD = 1;
/** Least total, the live agent minimum. */
const MIN_TOTAL_USD = 10;
const UNITS = [
  { hours: 1, one: "hour", many: "hours", max: 24 },
  { hours: 24, one: "day", many: "days", max: 30 },
  { hours: 168, one: "week", many: "weeks", max: 4 },
] as const;

/** "11 weeks", "5 days", "9 hours". */
function span(hours: number): string {
  if (hours < 48) return `${hours} hours`;
  if (hours < 24 * 14) return `${Math.round(hours / 24)} days`;
  return `${Math.round(hours / 168)} weeks`;
}

/**
 * DCA mode of the swap card (/swap, Jupiter style): spend a total of USDG on one token, every N days or
 * weeks, over N orders. Start launches a live DCA agent (strategy "dca", lib/engine/engine.ts dcaHour)
 * that buys from the owner's own wallet through Zolva's limited signer and never sells. One button walks
 * through log in, allow the signer, fund, start; the costs and the three agreements sit in the confirm
 * dialog. `head` is the card's Swap / DCA switch.
 */
export function RecurringBuy({ tokens, head }: { tokens: RecurringToken[]; head: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const { address, openLogin, status, busy: allowing, error: allowError, allow, refresh } = useLiveWallet();
  const [token, setToken] = useState(tokens.find((item) => item.symbol === "ETH")?.address ?? tokens[0]?.address ?? "");
  const [total, setTotal] = useState("");
  const [every, setEvery] = useState("1");
  const [unit, setUnit] = useState<number>(UNITS[2].hours);
  const [orders, setOrders] = useState("12");
  const [checks, setChecks] = useState({ risk: false, residence: false, terms: false });
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const picker = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);

  const chosen = tokens.find((item) => item.address === token) ?? null;
  const unitInfo = UNITS.find((item) => item.hours === unit)!;
  const totalUsd = Number(total) || 0;
  const everyCount = Math.round(Number(every) || 0);
  const orderCount = Math.round(Number(orders) || 0);
  const everyHours = everyCount * unit;
  const perOrder = orderCount > 0 ? totalUsd / orderCount : 0;
  const cap = status ? Math.max(MIN_TOTAL_USD, Math.min(status.maxCapitalUsd, Math.floor(status.usdg * 100) / 100)) : null;
  const cadence = everyCount === 1 ? `every ${unitInfo.one}` : `every ${everyCount} ${unitInfo.many}`;

  // The plan's own problem first (the summary line shows it), then the wallet's.
  const planProblem =
    totalUsd <= 0
      ? null
      : everyCount < 1 || everyCount > unitInfo.max
        ? `Every 1 to ${unitInfo.max} ${unitInfo.many}.`
        : (dcaPlanError(orderCount, everyHours) ??
          (totalUsd < MIN_TOTAL_USD
            ? `Spend at least $${MIN_TOTAL_USD} in total.`
            : status && totalUsd > status.maxCapitalUsd
              ? `Up to $${status.maxCapitalUsd} in total for now.`
              : perOrder < MIN_ORDER_USD
                ? `${usd(perOrder)} per order is under $1. Use fewer orders or a larger total.`
                : null));

  // One button, one next step.
  type Step = { label: string; onClick?: () => void; disabled?: boolean };
  const step: Step = !address
    ? { label: "Log in", onClick: () => openLogin() }
    : !status
      ? { label: "Checking your wallet…", disabled: true }
      : !status.open
        ? { label: "Real money is paused right now", disabled: true }
        : status.hasActiveLiveAgent
          ? { label: "You already run a real money agent", disabled: true }
          : !status.enabled
            ? { label: allowing ? "Waiting for approval…" : "Allow Zolva to buy for you", onClick: () => void allow(), disabled: allowing }
            : !chosen || totalUsd <= 0
              ? { label: "Enter an amount", disabled: true }
              : planProblem
                ? { label: "Fix the plan above", disabled: true }
                : status.usdg < totalUsd
                  ? { label: "Add USDG to your wallet", disabled: true }
                  : status.eth < MIN_GAS_ETH
                    ? { label: "Add ETH for gas", disabled: true }
                    : { label: "Start DCA", onClick: () => confirm.current?.showModal() };
  const needsFunds = Boolean(address && status?.enabled && (status.usdg < Math.max(totalUsd, MIN_TOTAL_USD) || status.eth < MIN_GAS_ETH));

  const start = async () => {
    if (!checks.risk || !checks.residence || !checks.terms) return setState({ busy: false, error: "Tick all three boxes to start." });
    setState({ busy: true, error: null });
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `DCA ${chosen!.symbol}`,
        strategy: "dca",
        tokens: [token],
        venue: "spot",
        capital: totalUsd,
        // DCA never sells and has no max position; the API still asks for both.
        maxPositionPct: 100,
        stopLossPct: 25,
        acceptTerms: true,
        mode: "live",
        dca: { buys: orderCount, everyHours },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok || !body.id) return setState({ busy: false, error: body.error ?? "Starting failed. Try again." });
    confirm.current?.close();
    toast(`DCA started. The first ${chosen!.symbol} order goes out at the top of the next hour.`);
    router.push(`/agents/${body.id}`);
  };

  return (
    <div className="swapbox dca">
      <div className="swapbox__head">
        {head}
        <span className="dca__hint" title="It never sells for you: no exit and no stop loss. The tokens stay in your wallet until you sell them yourself.">
          <i className="ph ph-info" aria-hidden="true" /> Buys only
        </span>
      </div>

      <section className="swapbox__panel" aria-label="Spend">
        <div className="swapbox__row">
          <span className="swapbox__label">Spend in total</span>
          {status && (
            <span className="swapbox__balance">
              <i className="ph ph-wallet" aria-hidden="true" /> {status.usdg.toFixed(2)} USDG
              {cap !== null && status.usdg > 0 && (
                <button className="swapbox__chip" type="button" onClick={() => setTotal(String(cap))}>
                  Max
                </button>
              )}
            </span>
          )}
        </div>
        <div className="swapbox__row">
          <input
            className="swapbox__amount"
            inputMode="decimal"
            placeholder="0.0"
            aria-label="USDG to spend in total"
            value={total}
            onChange={(event) => setTotal(event.target.value.replace(/[^0-9.]/g, ""))}
          />
          <span className="swapbox__token swapbox__token--fixed">
            <TickerAvatar symbol="USDG" size={28} />
            <strong>USDG</strong>
          </span>
        </div>
      </section>

      <section className="swapbox__panel swapbox__panel--buy" aria-label="Buy">
        <div className="swapbox__row">
          <span className="swapbox__label">Buy</span>
          <button className="swapbox__token" type="button" onClick={() => picker.current?.showModal()} aria-label={`Buy token: ${chosen?.symbol ?? "pick one"}`}>
            {chosen ? <TickerAvatar symbol={chosen.symbol} size={28} /> : <span className="swapbox__token-empty" />}
            <strong>{chosen?.symbol ?? "Select"}</strong>
            <i className="ph ph-caret-down" aria-hidden="true" />
          </button>
        </div>
      </section>

      <div className="dca__grid">
        {/* A div, not a label: a click on the unit menu must not jump to the number field. */}
        <div className="swapbox__panel dca__field">
          <span className="swapbox__label">Every</span>
          <span className="dca__inputs">
            <input className="dca__number" inputMode="numeric" aria-label="Every how many" value={every} onChange={(event) => setEvery(event.target.value.replace(/[^0-9]/g, ""))} />
            <span className="dca__unit">
              <Select value={unit} onChange={setUnit} label="Unit" options={UNITS.map((item) => ({ value: item.hours, label: everyCount === 1 ? item.one : item.many }))} />
            </span>
          </span>
        </div>
        <label className="swapbox__panel dca__field">
          <span className="swapbox__label">Over</span>
          <span className="dca__inputs">
            <input className="dca__number" inputMode="numeric" aria-label="Number of orders" value={orders} onChange={(event) => setOrders(event.target.value.replace(/[^0-9]/g, ""))} />
            <span className="muted">orders</span>
          </span>
        </label>
      </div>

      <p className={`dca__summary${planProblem ? " dca__summary--error" : ""}`} aria-live="polite">
        {planProblem ?? (
          <>
            <strong>{totalUsd > 0 ? usd(perOrder) : "$0.00"} USDG</strong> per order · {cadence} · runs about {span(everyHours * Math.max(1, orderCount - 1))}
          </>
        )}
      </p>

      {needsFunds && address && (
        <p className="dca__fund">
          Send USDG{status && status.eth < MIN_GAS_ETH ? " and a little ETH for gas" : ""} on Robinhood Chain to{" "}
          <a className="text-link mono" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer">
            {shortAddress(address)}
          </a>
          .{" "}
          <button className="text-link" type="button" onClick={refresh}>
            Refresh
          </button>
        </p>
      )}
      {allowError && <p className="field-error">{allowError}</p>}

      <button className="button button--primary swapbox__action" type="button" onClick={step.onClick} disabled={step.disabled}>
        {step.label}
      </button>
      {status?.hasActiveLiveAgent && (
        <p className="dca__fund">
          One real money agent at a time. Pause yours on the <Link href="/app">Dashboard</Link> to start a DCA.
        </p>
      )}

      <dialog ref={picker} className="modal swapbox__picker" aria-label="Pick a token" onClick={(event) => event.target === picker.current && picker.current?.close()}>
        <div className="modal__body">
          <h2 className="modal__title">Buy with DCA</h2>
          <ul className="swapbox__list">
            {tokens.map((item) => (
              <li key={item.address}>
                <button
                  type="button"
                  className="swapbox__item"
                  aria-current={item.address === token ? "true" : undefined}
                  onClick={() => {
                    setToken(item.address);
                    picker.current?.close();
                  }}
                >
                  <TickerAvatar symbol={item.symbol} size={36} />
                  <span className="swapbox__item-name">
                    <strong>{item.symbol}</strong>
                    <span className="muted">{item.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </dialog>

      <dialog ref={confirm} className="modal" aria-labelledby="dca-confirm-title">
        <div className="modal__body dca__confirm">
          <h2 className="modal__title" id="dca-confirm-title">
            Confirm your DCA
          </h2>
          <p>
            Buy <strong>{chosen?.symbol}</strong> with <strong>{usd(totalUsd)}</strong> USDG: {orderCount} orders of {usd(perOrder)}, {cadence}. The first order goes out at the top of the next hour.
          </p>
          <ul className="dca__notes muted">
            <li>No Zolva fee. The Uniswap pool&apos;s fee and slippage apply, and each order pays about $0.01 of gas in ETH from your wallet.</li>
            <li>It never sells: no exit and no stop loss. Usually earns less than buying at once, with smaller swings, and it does not protect you in a falling market.</li>
            <li>A stock token order waits while its market is closed for the hour; its share stays in cash and later orders spread it out.</li>
            <li>It runs from your own wallet through Zolva&apos;s limited signer. Pause it any time on its page.</li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={checks.risk} onChange={(event) => setChecks((value) => ({ ...value, risk: event.target.checked }))} />
            <span>I understand this uses my own money and I can lose some or all of it.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={checks.residence} onChange={(event) => setChecks((value) => ({ ...value, residence: event.target.checked }))} />
            <span>I am not a US person and not resident in a sanctioned country.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={checks.terms} onChange={(event) => setChecks((value) => ({ ...value, terms: event.target.checked }))} />
            <span>
              I accept the <Link href="/terms">terms</Link>.
            </span>
          </label>
          {state.error && <p className="field-error">{state.error}</p>}
          <div className="modal__actions">
            <button className="button button--ghost" type="button" onClick={() => confirm.current?.close()} disabled={state.busy}>
              Back
            </button>
            <button className="button button--primary" type="button" onClick={() => void start()} disabled={state.busy}>
              {state.busy ? "Starting…" : "Start buying"}
            </button>
          </div>
          <p className="dca__fund">
            Want to see it first? Try the <Link href="/studio?strategy=dca">DCA preset on paper</Link>.
          </p>
        </div>
      </dialog>
    </div>
  );
}
