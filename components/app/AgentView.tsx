"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useToast } from "@/components/ui/Providers";
import { LineChart } from "@/components/ui/LineChart";
import type { AgentDetail } from "@/lib/data/agents";
import {
  AiLimitFields,
  type CreditsView,
  type LimitDraft,
} from "@/components/app/AiCopilot";
import { DEFAULT_EXPIRY_DAYS, parseAiLimit } from "@/lib/ai/limits";
import { aiModel, formatCredits } from "@/lib/ai/models";
import type { Decision } from "@/lib/engine/engine";
import { describeCondition, type Rules } from "@/lib/engine/rules";
import {
  dateAt,
  dayAt,
  isMarketHours,
  percent,
  points,
  price,
  shortAddress,
  STRATEGY_NAMES,
  tone,
  usd,
} from "@/lib/format";

export type Preview = {
  startTs: number;
  equity: number[];
  hold: number[];
  returnPct: number;
  holdReturnPct: number;
} | null;

type Props = {
  detail: AgentDetail;
  isOwner: boolean;
  /** The owner's AI credits (only loaded for the owner). */
  credits: CreditsView;
  /** Latest close per token address. */
  prices: Record<string, number>;
  /** Same settings over the last 30 days, shown while the agent has no history yet. */
  preview: Preview;
  symbols: Record<string, string>;
};

const RANGES = { "7d": 7 * 24, "30d": 30 * 24, all: Infinity } as const;

export function AgentView({
  detail,
  isOwner,
  credits,
  prices,
  preview,
  symbols,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const { agent, summary, runs, trades, positions } = detail;
  const [range, setRange] = useState<keyof typeof RANGES>("all");
  const [showHolds, setShowHolds] = useState(false);
  const [busy, setBusy] = useState(false);
  const pauseRef = useRef<HTMLDialogElement>(null);
  const liveRef = useRef<HTMLDialogElement>(null);
  const publishRef = useRef<HTMLDialogElement>(null);
  const limitRef = useRef<HTMLDialogElement>(null);
  const limitUsd =
    agent.ai_limit_micro === null
      ? null
      : Number(agent.ai_limit_micro) / 1_000_000;
  const limitExpires = agent.ai_limit_expires_at
    ? Date.parse(agent.ai_limit_expires_at)
    : null;
  const limitState =
    detail.aiLimitExpired
      ? "Expired"
      : limitUsd !== null && detail.aiSpentUsd >= limitUsd
        ? "Limit reached"
        : null;
  const [limitDraft, setLimitDraft] = useState<LimitDraft>({
    usd: (limitUsd ?? 0.5).toFixed(2),
    days: DEFAULT_EXPIRY_DAYS,
  });
  const [limitError, setLimitError] = useState<string | null>(null);

  const saveLimit = async () => {
    const parsed = parseAiLimit(limitDraft.usd, limitDraft.days);
    if (!parsed.ok) return setLimitError(parsed.error);
    setBusy(true);
    const response = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiLimitUsd: Number(limitDraft.usd),
        aiExpiryDays: limitDraft.days,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok)
      return setLimitError(body.error ?? "Updating failed. Please try again.");
    limitRef.current?.close();
    toast("AI limit updated");
    router.refresh();
  };
  const isPublished = agent.published_at !== null;
  const isActive = agent.status === "active";
  const minutesToNextRun = 60 - new Date().getUTCMinutes();
  const symbolOf = (token: string) => symbols[token] ?? token;

  const togglePause = async () => {
    setBusy(true);
    const status = agent.status === "active" ? "paused" : "active";
    const response = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    pauseRef.current?.close();
    if (!response.ok)
      return toast(body.error ?? "Updating failed. Please try again.");
    toast(
      status === "active"
        ? "Agent resumed. It continues from the next hour."
        : "Agent paused",
    );
    router.refresh();
  };

  const togglePublish = async () => {
    setBusy(true);
    const published = !isPublished;
    const response = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    publishRef.current?.close();
    if (!response.ok)
      return toast(body.error ?? "Updating failed. Please try again.");
    toast(
      published
        ? "Published. Your agent is on the leaderboard."
        : "Unpublished. Only you can see this agent now.",
    );
    router.refresh();
  };

  const share = () =>
    navigator.clipboard?.writeText(window.location.href).then(
      () => toast("Link copied"),
      () => toast("Copy failed. Copy the address bar instead."),
    );

  const rules = agent.params.rules as Rules | undefined;
  const settings: [string, React.ReactNode][] = [
    ["Strategy", STRATEGY_NAMES[agent.strategy]],
    ["AI co-pilot", aiModel(agent.ai_model)?.label ?? "Off"],
    ...(agent.ai_model
      ? ([
          [
            "AI budget",
            <span key="budget" className="ai-budget">
              <span>
                {formatCredits(detail.aiSpentUsd)} of{" "}
                {limitUsd === null ? "no limit" : formatCredits(limitUsd)}
                {limitExpires !== null && (
                  <span className="muted">
                    {" "}
                    · until {dateAt(limitExpires / 1000)}
                  </span>
                )}
              </span>
              {limitState && (
                <span className="pill pill--warn">{limitState}</span>
              )}
              {isOwner && (
                <button
                  className="text-link"
                  type="button"
                  onClick={() => {
                    setLimitError(null);
                    limitRef.current?.showModal();
                  }}
                >
                  Edit
                </button>
              )}
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ["Stocks", summary.tokens.map((token) => token.symbol).join(", ")],
    ["Starting capital", usd(summary.startCapital)],
    ["Max per stock", `${agent.params.max_position_pct}%`],
    ["Stop loss", `${agent.params.stop_loss_pct}%`],
    ...(rules?.takeProfitPct
      ? ([["Take profit", `${rules.takeProfitPct}%`]] as [string, string][])
      : []),
    ...(rules?.maxHoldHours
      ? ([["Max holding time", `${rules.maxHoldHours} hours`]] as [
          string,
          string,
        ][])
      : []),
    [
      "Owner",
      summary.isHouse ? (
        "Zolva (house agent)"
      ) : (
        <span className="mono">{shortAddress(agent.owner)}</span>
      ),
    ],
    ["Launched", dateAt(Date.parse(agent.created_at) / 1000)],
  ];

  const header = (
    <div className="agent-head">
      <div>
        <Link
          className="eyebrow"
          href={isOwner ? "/app" : "/leaderboard"}
          style={{ textDecoration: "none" }}
        >
          <i className="ph ph-arrow-left" />
          {isOwner ? "Dashboard" : "Leaderboard"}
        </Link>
        <h1 className="page__title" style={{ marginTop: "var(--space-100)" }}>
          {agent.name}
        </h1>
        <div className="agent-head__meta">
          {agent.status === "active" ? (
            <span className="pill pill--running">
              <span className="pulse" />
              Running
            </span>
          ) : (
            <span className="pill pill--paused">
              <i className="ph ph-pause" />
              Paused
            </span>
          )}
          {summary.isHouse && <span className="pill">by Zolva</span>}
          {isOwner && !summary.isHouse && (
            <span className="pill">
              <i
                className={`ph ${isPublished ? "ph-globe-simple" : "ph-lock-simple"}`}
                aria-hidden="true"
              />
              {isPublished ? "On leaderboard" : "Private"}
            </span>
          )}
          <span>{STRATEGY_NAMES[agent.strategy]}</span>
          <span aria-hidden="true">·</span>
          <span>{summary.tokens.map((token) => token.symbol).join(", ")}</span>
          <span aria-hidden="true">·</span>
          <span>
            {agent.status === "active"
              ? `Next decision in ${minutesToNextRun} min`
              : "Not trading while paused"}
          </span>
        </div>
      </div>
      <div className="hero__actions">
        {isOwner && (
          <button
            className="button button--ghost"
            type="button"
            onClick={() => liveRef.current?.showModal()}
          >
            <i className="ph ph-wallet" />
            Trade with real money
            <span className="pill pill--accent">Soon</span>
          </button>
        )}
        {isOwner && (
          <button
            className="button button--ghost"
            type="button"
            onClick={() => pauseRef.current?.showModal()}
            disabled={busy}
          >
            <i className={`ph ${isActive ? "ph-pause" : "ph-play"}`} />
            {isActive ? "Pause" : "Resume"}
          </button>
        )}
        {isOwner && !summary.isHouse && (
          <button
            className={`button ${isPublished ? "button--ghost" : "button--primary"}`}
            type="button"
            onClick={() => publishRef.current?.showModal()}
            disabled={busy}
          >
            <i
              className={`ph ${isPublished ? "ph-eye-slash" : "ph-trophy"}`}
              aria-hidden="true"
            />
            {isPublished ? "Unpublish" : "Publish to leaderboard"}
          </button>
        )}
        {(isPublished || summary.isHouse) && (
          <button
            className="button button--ghost"
            type="button"
            onClick={share}
          >
            <i className="ph ph-share-network" />
            Share
          </button>
        )}
      </div>
    </div>
  );

  // Pausing stops the hourly runs entirely, so positions are kept but not managed.
  const pauseDialog = (
    <dialog
      ref={pauseRef}
      className="modal"
      aria-labelledby="pause-title"
      onClick={(event) => {
        if (event.target === pauseRef.current) pauseRef.current?.close();
      }}
    >
      <div className="modal__body">
        <span className="choice__glyph" aria-hidden="true">
          <i className={`ph ${isActive ? "ph-pause" : "ph-play"}`} />
        </span>
        <h2 className="modal__title" id="pause-title">
          {isActive ? `Pause ${agent.name}?` : `Resume ${agent.name}?`}
        </h2>
        {isActive ? (
          <ul className="modal__list">
            <li>It stops making decisions from the next hour.</li>
            <li>
              {positions.length
                ? `Its ${positions.length} open position${positions.length === 1 ? " stays" : "s stay"} open, but the stop loss and sell rules don't run while paused.`
                : "It holds no stocks right now, so nothing is left open."}
            </li>
            <li>
              You can resume it at any time. The hours it was paused are
              skipped, not traded later.
            </li>
          </ul>
        ) : (
          <ul className="modal__list">
            <li>
              It starts deciding again from the next hour, with the same
              settings.
            </li>
            <li>The hours it was paused are skipped, not traded afterwards.</li>
            <li>It counts toward your 5 running agents.</li>
          </ul>
        )}
        <div className="modal__actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => pauseRef.current?.close()}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={togglePause}
            disabled={busy}
          >
            {busy ? "Saving…" : isActive ? "Pause agent" : "Resume agent"}
          </button>
        </div>
      </div>
    </dialog>
  );

  // Changing the budget sets a new total limit and a new end date counted from today.
  const limitDialog = agent.ai_model && (
    <dialog
      ref={limitRef}
      className="modal"
      aria-labelledby="limit-title"
      onClick={(event) => {
        if (event.target === limitRef.current) limitRef.current?.close();
      }}
    >
      <div className="modal__body">
        <span className="choice__glyph" aria-hidden="true">
          <i className="ph ph-coins" />
        </span>
        <h2 className="modal__title" id="limit-title">
          AI limit for {agent.name}
        </h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: "20px" }}>
          Spent so far: {formatCredits(detail.aiSpentUsd)}. The new limit counts
          everything spent since launch, and the period starts today.
        </p>
        <AiLimitFields
          value={limitDraft}
          onChange={setLimitDraft}
          modelId={agent.ai_model}
          credits={credits}
          error={limitError}
        />
        <div className="modal__actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => limitRef.current?.close()}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={saveLimit}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save limit"}
          </button>
        </div>
      </div>
    </dialog>
  );

  const publishDialog = (
    <dialog
      ref={publishRef}
      className="modal"
      aria-labelledby="publish-title"
      onClick={(event) => {
        if (event.target === publishRef.current) publishRef.current?.close();
      }}
    >
      <div className="modal__body">
        <span className="choice__glyph" aria-hidden="true">
          <i className={`ph ${isPublished ? "ph-eye-slash" : "ph-trophy"}`} />
        </span>
        <h2 className="modal__title" id="publish-title">
          {isPublished
            ? `Take ${agent.name} off the leaderboard?`
            : `Publish ${agent.name}?`}
        </h2>
        {isPublished ? (
          <ul className="modal__list">
            <li>It leaves the leaderboard, markets and the activity report.</li>
            <li>Its page and link only work for you again.</li>
            <li>
              It keeps trading as before. You can publish it again at any time.
            </li>
          </ul>
        ) : (
          <ul className="modal__list">
            <li>
              It appears on the leaderboard, ranked on its live results since
              launch, losses included.
            </li>
            <li>
              Anyone can open its page: settings, rules, trades and reasoning.
              Your wallet shows shortened.
            </li>
            <li>You can unpublish it at any time.</li>
          </ul>
        )}
        <div className="modal__actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => publishRef.current?.close()}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={togglePublish}
            disabled={busy}
          >
            {busy ? "Saving…" : isPublished ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>
    </dialog>
  );

  // Real money is not built yet. An agent's mode can never change (the database
  // forbids it), so going live will copy these settings into a new live agent.
  const liveDialog = (
    <dialog
      ref={liveRef}
      className="modal"
      aria-labelledby="live-title"
      onClick={(event) => {
        if (event.target === liveRef.current) liveRef.current?.close();
      }}
    >
      <div className="modal__body">
        <span className="choice__glyph" aria-hidden="true">
          <i className="ph ph-wallet" />
        </span>
        <span className="pill pill--accent" style={{ width: "fit-content" }}>
          Coming soon
        </span>
        <h2 className="modal__title" id="live-title">
          Take {agent.name} live
        </h2>
        <p className="muted">
          Real money trading is not available yet. When it opens, this is how it
          will work:
        </p>
        <ul className="modal__list">
          <li>
            A live copy of this agent starts with the same strategy, stocks and
            rules.
          </li>
          <li>
            It trades from your own wallet, within a limit per trade and per day
            that you set.
          </li>
          <li>You can stop it at any time with one switch.</li>
          <li>
            This paper agent keeps running, and its track record stays as it is.
          </li>
        </ul>
        <div className="modal__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={() => liveRef.current?.close()}
          >
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );

  const settingsCard = (
    <div className="card">
      <h2 className="card__title" style={{ marginBottom: "var(--space-200)" }}>
        Settings
      </h2>
      <div
        className="stack stack--tight"
        style={{ fontSize: 14, lineHeight: "20px" }}
      >
        {settings.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-200)",
            }}
          >
            <span className="muted">{label}</span>
            <span style={{ textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>
      {rules && (
        <div
          className="stack stack--tight"
          style={{ marginTop: "var(--space-200)" }}
        >
          <strong style={{ fontSize: 14 }}>
            Buy when {rules.entry.join} of:
          </strong>
          <ul className="rule-summary">
            {rules.entry.conditions.map((condition, i) => (
              <li key={i}>{describeCondition(condition)}</li>
            ))}
          </ul>
          <strong style={{ fontSize: 14 }}>
            Sell when {rules.exit.join} of:
          </strong>
          <ul className="rule-summary">
            {rules.exit.conditions.length ? (
              rules.exit.conditions.map((condition, i) => (
                <li key={i}>{describeCondition(condition)}</li>
              ))
            ) : (
              <li>No rule: take profit, max holding time or stop loss</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );

  if (!runs.length) {
    return (
      <div className="container page">
        {header}
        {isOwner && pauseDialog}
        {isOwner && liveDialog}
        {isOwner && publishDialog}
        {isOwner && limitDialog}
        <div className="agent-layout">
          <div className="stack">
            <div className="card">
              <div className="stat-grid">
                <Stat label="Value" value={usd(summary.startCapital)} />
                <Stat label="Return" value="0.0%" />
                <Stat label="Cash" value={usd(Number(agent.cash))} />
                <Stat label="Trades" value="0" />
              </div>
            </div>
            <div className="card">
              <div className="empty">
                <img
                  src="/img/icons/backtest.png"
                  alt=""
                  width={72}
                  height={72}
                />
                <h2 className="card__title">
                  {agent.status === "active"
                    ? "Waiting for the first decision"
                    : "Paused before its first decision"}
                </h2>
                <p>
                  {agent.status === "active"
                    ? `The agent checks prices at the top of every hour, in about ${minutesToNextRun} minutes. Trades and reasoning show up here.`
                    : "Resume it and it starts deciding from the next hour."}
                </p>
              </div>
            </div>
          </div>
          <div className="stack">
            {preview && (
              <div className="card stack">
                <div>
                  <div className="eyebrow">While you wait</div>
                  <h2 className="card__title">
                    These settings over the last 30 days
                  </h2>
                </div>
                <LineChart
                  startTs={preview.startTs}
                  height={140}
                  baseline={summary.startCapital}
                  step={3}
                  series={[
                    {
                      label: "Backtest",
                      values: preview.equity,
                      color: "var(--color-text-muted)",
                    },
                  ]}
                  legend={false}
                />
                <div
                  className={tone(preview.returnPct)}
                  style={{ fontSize: 24, lineHeight: "32px", fontWeight: 600 }}
                >
                  {percent(preview.returnPct)}{" "}
                  <span
                    className="muted"
                    style={{
                      fontSize: 14,
                      lineHeight: "20px",
                      fontWeight: 400,
                    }}
                  >
                    vs holding {percent(preview.holdReturnPct)}
                  </span>
                </div>
              </div>
            )}
            {settingsCard}
          </div>
        </div>
      </div>
    );
  }

  const visible = runs.slice(Math.max(0, runs.length - RANGES[range]));
  const lastRun = runs[runs.length - 1];
  const logRuns = [...runs]
    .reverse()
    .filter(
      (run) =>
        showHolds ||
        !summary.trades ||
        run.decisions.some((decision) => decision.action !== "hold"),
    )
    .slice(0, showHolds || !summary.trades ? 24 : 12);

  return (
    <div className="container page">
      {header}
      {isOwner && pauseDialog}
      {isOwner && liveDialog}
      {isOwner && publishDialog}
      {isOwner && limitDialog}
      <div className="agent-layout">
        <div className="stack">
          <div className="card stack">
            <div className="stat-grid">
              <Stat label="Value" value={usd(summary.equity)} />
              <Stat
                label={`Return since ${dayAt(Date.parse(agent.created_at) / 1000)}`}
                value={percent(summary.returnPct)}
                className={tone(summary.returnPct)}
              />
              <Stat
                label="vs holding"
                value={points(summary.edge)}
                className={tone(summary.edge)}
              />
              <Stat
                label="Worst drop"
                value={percent(-summary.maxDrawdownPct)}
              />
            </div>
            <div className="card-head" style={{ margin: 0 }}>
              <h2 className="card__title">Value over time</h2>
              <div className="tabs" role="tablist" aria-label="Chart range">
                {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((key) => (
                  <button
                    key={key}
                    className="tab"
                    role="tab"
                    type="button"
                    aria-selected={range === key}
                    onClick={() => setRange(key)}
                  >
                    {key === "all" ? "All" : key.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              startTs={visible[0].ts}
              height={240}
              baseline={summary.startCapital}
              series={[
                {
                  label: "Agent",
                  values: visible.map((run) => run.equity),
                  color: "var(--color-purple-rich)",
                },
                {
                  label: "Holding",
                  values: visible.map((run) => run.holdEquity),
                  color: "var(--color-hold-line)",
                  dashed: true,
                },
              ]}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Decision log</h2>
              {summary.trades ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showHolds}
                    onChange={(event) => setShowHolds(event.target.checked)}
                  />
                  Show hours with no trade
                </label>
              ) : (
                <span className="pill">Latest hours</span>
              )}
            </div>
            {logRuns.map((run) => (
              <div key={run.ts} className="log-run">
                <span className="log-run__time">
                  {dateAt(run.ts)}
                  {isMarketHours(run.ts) ? "" : " · DEX hours"}
                </span>
                {run.decisions.map((decision, i) => (
                  <DecisionRow
                    key={i}
                    symbol={symbolOf(decision.token)}
                    action={decision.action}
                    reasoning={decision.reasoning}
                    ai={decision.ai}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Trades</h2>
              <span
                className="muted"
                style={{ fontSize: 14, lineHeight: "20px" }}
              >
                {summary.trades} total, 0.5% cost each
              </span>
            </div>
            {trades.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Side</th>
                      <th>Stock</th>
                      <th className="num">Price</th>
                      <th className="num">Size</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, i) => (
                      <tr key={i}>
                        <td className="muted">{dateAt(trade.ts)}</td>
                        <td>
                          <span
                            className={`decision__action decision__action--${trade.side}`}
                          >
                            {trade.side}
                          </span>
                        </td>
                        <td>
                          <strong>{trade.symbol}</strong>
                        </td>
                        <td className="num">{price(trade.price)}</td>
                        <td className="num">
                          {usd(trade.quantity * trade.price)}
                        </td>
                        <td>
                          {trade.reason === "stop_loss" && (
                            <span className="pill pill--warn">Stop loss</span>
                          )}
                          {trade.reason === "take_profit" && (
                            <span className="pill pill--running">
                              Take profit
                            </span>
                          )}
                          {trade.reason === "max_hold" && (
                            <span className="pill">Max hold</span>
                          )}{" "}
                          {!isMarketHours(trade.ts) && (
                            <span
                              className="pill"
                              title="New York exchange closed. Price came from Robinhood Chain trading only."
                            >
                              DEX hours
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <img
                  src={`/img/icons/${agent.strategy === "mean_reversion" ? "mean-reversion" : agent.strategy === "custom" ? "backtest" : "momentum"}.png`}
                  alt=""
                  width={72}
                  height={72}
                />
                <h3 className="card__title">Waiting for its moment</h3>
                <p>
                  The agent only trades when its rules trigger. Every hour so
                  far ended in a hold; the log above shows why.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack stack--tight">
            <h2 className="card__title">Latest decision</h2>
            <span
              className="muted"
              style={{ fontSize: 12, lineHeight: "16px" }}
            >
              {dateAt(lastRun.ts)}
            </span>
            {lastRun.decisions.map((decision, i) => (
              <DecisionRow
                key={i}
                symbol={symbolOf(decision.token)}
                action={decision.action}
                reasoning={decision.reasoning}
                ai={decision.ai}
              />
            ))}
          </div>
          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Holdings</h2>
              <span
                className="mono muted"
                style={{ fontSize: 14, lineHeight: "20px" }}
              >
                Cash {usd(lastRun.cash)}
              </span>
            </div>
            {positions.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Stock</th>
                      <th className="num">Entry</th>
                      <th className="num">Now</th>
                      <th className="num">P&amp;L</th>
                      <th className="num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => {
                      const now = prices[position.token] ?? position.entryPrice;
                      const change = (now / position.entryPrice - 1) * 100;
                      return (
                        <tr key={position.token}>
                          <td>
                            <strong>{position.symbol}</strong>
                          </td>
                          <td className="num">{price(position.entryPrice)}</td>
                          <td className="num">{price(now)}</td>
                          <td className={`num ${tone(change)}`}>
                            {percent(change)}
                          </td>
                          <td className="num">
                            {usd(position.quantity * now)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="cash-state">
                <div className="cash-state__bar">
                  <span style={{ width: "100%" }} />
                </div>
                <div className="growth__row" style={{ border: 0, padding: 0 }}>
                  <span className="muted">Cash</span>
                  <strong>100%</strong>
                </div>
                <p
                  className="muted"
                  style={{ fontSize: 13, lineHeight: "18px" }}
                >
                  Fully in cash. It buys the moment its rules trigger.
                </p>
              </div>
            )}
          </div>
          {settingsCard}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${className}`}>{value}</span>
    </div>
  );
}

export function DecisionRow({
  symbol,
  action,
  reasoning,
  ai,
}: {
  symbol: string;
  action: string;
  reasoning: string;
  ai?: Decision["ai"];
}) {
  return (
    <div className="decision">
      <span className={`decision__action decision__action--${action}`}>
        {action}
      </span>
      <span>
        <strong>{symbol}</strong> <span className="muted">{reasoning}</span>
        {ai && (
          <span className="decision__ai">
            <span
              className={`pill ${ai.verdict === "approved" ? "pill--accent" : "pill--warn"}`}
            >
              <i className="ph ph-sparkle" aria-hidden="true" /> AI {ai.verdict}
            </span>{" "}
            {ai.verdict === "approved" ? ai.reasoning : null}
            <span className="decision__ai-model">
              {aiModel(ai.model)?.label ?? ai.model}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}
