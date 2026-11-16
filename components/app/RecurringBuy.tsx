"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LiveSetup, liveReady, type LiveStatusView } from "@/components/app/LiveSetup";
import { useToast } from "@/components/ui/Providers";
import { DCA_BUYS, DCA_CADENCES } from "@/lib/agents/copy";
import { usd } from "@/lib/format";

/** A market a real money agent can buy: an allowlisted spot token on a Uniswap v3 pool. */
export type RecurringToken = { address: string; symbol: string; name: string };

/** Least USDG per scheduled buy (the database checks it too: agents_dca_plan). */
const MIN_BUY_USD = 1;

/**
 * "Recurring buy" on /swap: DCA with real money. It launches a live DCA agent (strategy "dca",
 * lib/engine/engine.ts dcaHour) that buys the same amount on a schedule from the owner's own wallet
 * through Zolva's signer and never sells. Every real money limit of a live agent applies.
 */
export function RecurringBuy({ tokens }: { tokens: RecurringToken[] }) {
  const router = useRouter();
  const toast = useToast();
  const [token, setToken] = useState(tokens.find((item) => item.symbol === "ETH")?.address ?? tokens[0]?.address ?? "");
  const [total, setTotal] = useState(12);
  const [buys, setBuys] = useState<number>(DCA_BUYS[0]);
  const [everyHours, setEveryHours] = useState<number>(DCA_CADENCES[1].everyHours);
  const [status, setStatus] = useState<LiveStatusView | null>(null);
  const [checks, setChecks] = useState({ risk: false, residence: false, terms: false });
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const symbol = tokens.find((item) => item.address === token)?.symbol ?? "";
  const cap = status ? Math.max(10, Math.min(status.maxCapitalUsd, Math.floor(status.usdg))) : 100;
  const perBuy = total / buys;
  const daily = everyHours === 24;
  const problem =
    total < 10 || total > cap
      ? `Pick between $10 and $${cap}.`
      : perBuy < MIN_BUY_USD
        ? `Each buy would be ${usd(perBuy)}. Pick fewer buys or a larger amount: every buy is at least $1.`
        : null;

  const start = async () => {
    if (problem) return setState({ busy: false, error: problem });
    if (!checks.risk || !checks.residence || !checks.terms) return setState({ busy: false, error: "Please tick all three boxes to start." });
    setState({ busy: true, error: null });
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `DCA ${symbol}`,
        strategy: "dca",
        tokens: [token],
        venue: "spot",
        capital: total,
        // DCA never sells and has no max position; the API still asks for both.
        maxPositionPct: 100,
        stopLossPct: 25,
        acceptTerms: true,
        mode: "live",
        dca: { buys, everyHours },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok || !body.id) return setState({ busy: false, error: body.error ?? "Starting failed. Please try again." });
    toast(`Recurring buy started. The first ${symbol} buy comes at the top of the next hour.`);
    router.push(`/agents/${body.id}`);
  };

  return (
    <section className="card recurring-buy" aria-labelledby="recurring-title">
      <h2 className="card__title" id="recurring-title">
        Recurring buy <span className="pill">Real money</span>
      </h2>
      <p className="muted recurring-buy__lead">
        Spread your entry over time: the same amount on a schedule, from your own wallet, signed by Zolva&apos;s limited signer so you don&apos;t sign each buy. It never sells. Usually earns less
        than buying everything at once, with smaller swings, and it does not protect you in a falling market.
      </p>

      <div className="form-section">
        <label className="form-section__label" htmlFor="recurring-token">
          Buy
        </label>
        <select id="recurring-token" className="input" value={token} onChange={(event) => setToken(event.target.value)}>
          {tokens.map((item) => (
            <option key={item.address} value={item.address}>
              {item.symbol} · {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-section">
        <label className="form-section__label" htmlFor="recurring-total">
          Total <span className="form-section__hint">USDG from your wallet, $10 to ${cap}</span>
        </label>
        <input
          id="recurring-total"
          className="input mono"
          type="number"
          min={10}
          max={cap}
          step={1}
          value={total}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) setTotal(Math.max(0, value));
          }}
        />
      </div>

      <div className="form-section">
        <div className="form-section__label">Schedule</div>
        <div className="dca-schedule">
          <div className="tabs" role="radiogroup" aria-label="Number of buys">
            {DCA_BUYS.map((count) => (
              <button key={count} className="tab" type="button" role="radio" aria-checked={buys === count} onClick={() => setBuys(count)}>
                {count} buys
              </button>
            ))}
          </div>
          <div className="tabs" role="radiogroup" aria-label="How often">
            {DCA_CADENCES.map((cadence) => (
              <button key={cadence.everyHours} className="tab" type="button" role="radio" aria-checked={everyHours === cadence.everyHours} onClick={() => setEveryHours(cadence.everyHours)}>
                {cadence.label}
              </button>
            ))}
          </div>
        </div>
        <p className="recurring-buy__plan">
          <strong>{usd(perBuy)}</strong> of {symbol} {daily ? "every day" : "every week"}, {buys} times, starting at the top of the next hour and running about {daily ? `${buys} days` : `${buys} weeks`}.
        </p>
      </div>

      <ul className="recurring-buy__costs muted">
        <li>No Zolva fee. The Uniswap pool&apos;s own fee and slippage apply, and each buy pays about $0.01 of gas in ETH from your wallet.</li>
        <li>A stock token buy is skipped while its market is closed for the hour; its share stays in cash and later buys spread it out.</li>
        <li>Pause it any time on its agent page. Bought tokens stay in your wallet.</li>
      </ul>

      <LiveSetup onStatus={setStatus} />

      <div className="recurring-buy__checks">
        <label className="check">
          <input type="checkbox" checked={checks.risk} onChange={(event) => setChecks((value) => ({ ...value, risk: event.target.checked }))} />
          <span>I understand this buys with my own money, that I can lose some or all of it, and that it never sells for me.</span>
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
      </div>

      {(state.error ?? problem) && <p className="field-error">{state.error ?? problem}</p>}
      <button className="button button--primary button--large" type="button" disabled={state.busy || !liveReady(status) || !token} onClick={() => void start()}>
        {state.busy ? "Starting…" : `Start buying ${symbol}`}
      </button>
      <p className="note">
        <i className="ph ph-info" />
        Runs as a real money agent: up to ${status?.maxCapitalUsd ?? 100}, one at a time. Want to see it first? Try the <Link href="/studio?strategy=dca">DCA preset on paper</Link>.
      </p>
    </section>
  );
}
