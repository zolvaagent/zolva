"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth, useToast } from "@/components/ui/Providers";
import { LineChart } from "@/components/ui/LineChart";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { PromptWriter, type CustomMode, type Generated } from "@/components/app/PromptWriter";
import { AiCopilotPicker, type CreditsView, type LimitDraft } from "@/components/app/AiCopilot";
import { LiveSetup, liveReady, type LiveStatusView } from "@/components/app/LiveSetup";
import { DEFAULT_EXPIRY_DAYS, parseAiLimit, suggestedLimitUsd } from "@/lib/ai/limits";
import { aiModel } from "@/lib/ai/models";
import { buyAndHold, simulate } from "@/lib/engine/engine";
import { INDICATORS, MAX_CONDITIONS, OPERATORS, parseRules, RULE_TEMPLATES, rulesLookback, type Condition, type IndicatorKind, type Operator, type RuleGroup, type Rules } from "@/lib/engine/rules";
import { LOOKBACK_HOURS } from "@/lib/engine/strategies";
import { dayAt, percent, usd } from "@/lib/format";
import { track } from "@/lib/funnel";
import { openingPreset, PRESET_MAX_POSITION_PCT, PRESET_STOP_LOSS_PCT, scorePresets, suggestedName, type ScoredPreset } from "@/lib/studio/presets";
import type { Market } from "@/lib/data/market";
import { maxMarketsFor, strategyNeedsPerps, type StudioStrategy } from "@/lib/agents/copy";

const BACKTEST_HOURS = 30 * 24;
const MAX_ACTIVE = 5;
/** The picker shows stocks first, then crypto; one agent may hold both. */
const TOKEN_GROUPS = [
  ["stock", "Stocks"],
  ["crypto", "Crypto"],
] as const;

type Strategy = StudioStrategy;
type Venue = "spot" | "perps";

const BLANK_RULES: Rules = {
  entry: { join: "all", conditions: [{ left: { kind: "price" }, op: "crossesAbove", right: { kind: "sma", hours: 24 } }] },
  exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "crossesBelow", right: { kind: "sma", hours: 24 } }] },
  takeProfitPct: null,
  maxHoldHours: null,
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A published agent to start from ("Copy to Studio" on /agents and agent pages). */
export type StudioTemplate = { id: string; name: string; strategy: Strategy; venue?: Venue; rules: Rules | null; symbols: string[]; maxPositionPct: number; stopLossPct: number };

/** Dip hunter and Spike fade enter one market at a time, so they cannot trade real money yet. */
const PAPER_ONLY_STRATEGIES: readonly Strategy[] = ["dip_hunter", "spike_fade"];

export function Studio({
  market,
  activeCount,
  initialStrategy,
  initialStock,
  credits,
  template = null,
}: {
  market: Market;
  activeCount: number;
  initialStrategy?: string;
  initialStock?: string;
  credits: CreditsView;
  template?: StudioTemplate | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { address, openLogin } = useAuth();
  const startStrategy: Strategy = initialStrategy === "mean_reversion" || initialStrategy === "custom" ? initialStrategy : "momentum";
  const startStock = market.tokens.find((token) => token.symbol === initialStock?.toUpperCase() && token.venue !== "lighter")?.symbol ?? "NVDA";

  // Until the user types a name, the agent is named after its markets and strategy.
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  // Three fixed starting points with their real last 30 days. A plain visit to the Studio (no
  // template, no strategy or market in the link) opens on the best of them.
  const presets = useMemo(() => scorePresets(market), [market]);
  const opening = !template && !initialStrategy && !initialStock ? openingPreset(presets) : null;
  // A template only keeps markets that still trade here.
  const templateSymbols = template?.symbols.filter((symbol) => market.tokens.some((token) => token.symbol === symbol)) ?? [];
  const [strategy, setStrategy] = useState<Strategy>(template?.strategy ?? opening?.strategy ?? startStrategy);
  const [rules, setRules] = useState<Rules>(clone(template?.rules ?? RULE_TEMPLATES.momentum));
  const [symbols, setSymbols] = useState<string[]>(templateSymbols.length ? templateSymbols : opening ? [...opening.symbols] : [startStock]);
  // Spot: stock and crypto tokens on the DEX. Perps: Lighter perps, paper only, the venue for shorts.
  const [venue, setVenue] = useState<Venue>(template?.venue ?? "spot");
  const perps = venue === "perps";
  const venueTokens = market.tokens.filter((token) => (token.venue === "lighter") === perps);
  const maxMarkets = maxMarketsFor(strategy);
  const [capital, setCapital] = useState(10_000);
  // Real money: the mode, the wallet status from LiveSetup and the USDG the agent starts with.
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [liveStatus, setLiveStatus] = useState<LiveStatusView | null>(null);
  const [liveCapital, setLiveCapital] = useState(50);
  const live = mode === "live";
  const liveCap = liveStatus ? Math.max(10, Math.min(liveStatus.maxCapitalUsd, Math.floor(liveStatus.usdg))) : 100;
  const agentCapital = live ? Math.min(liveCapital, liveCap) : capital;
  const [maxPositionPct, setMaxPositionPct] = useState(template?.maxPositionPct ?? PRESET_MAX_POSITION_PCT);
  const [stopLossPct, setStopLossPct] = useState(template?.stopLossPct ?? PRESET_STOP_LOSS_PCT);
  const agentName = nameTouched ? name : suggestedName(strategy, symbols);
  // Funnel: one view per visit to the Studio.
  useEffect(() => track("studio_view", template ? "template" : undefined), [template]);
  const applyPreset = (preset: ScoredPreset) => {
    track("preset_pick", preset.id);
    setVenue("spot");
    setStrategy(preset.strategy);
    setSymbols([...preset.symbols]);
    setMaxPositionPct(PRESET_MAX_POSITION_PCT);
    setStopLossPct(PRESET_STOP_LOSS_PCT);
  };
  const [showErrors, setShowErrors] = useState(false);
  const [aiModelId, setAiModelId] = useState<string | null>(null);
  const [aiLimit, setAiLimit] = useState<LimitDraft>({ usd: "", days: DEFAULT_EXPIRY_DAYS });
  // Until the user types a limit, it follows the suggestion for the chosen model.
  const [aiLimitTouched, setAiLimitTouched] = useState(false);
  const parsedAiLimit = aiModelId ? parseAiLimit(aiLimit.usd, aiLimit.days) : null;
  const aiLimitError = parsedAiLimit && !parsedAiLimit.ok ? parsedAiLimit.error : null;
  const chooseAiModel = (id: string | null) => {
    setAiModelId(id);
    const model = aiModel(id);
    if (model && !aiLimitTouched) setAiLimit((current) => ({ ...current, usd: suggestedLimitUsd(model).toFixed(2) }));
  };
  const [customMode, setCustomMode] = useState<CustomMode>("rules");
  const [generated, setGenerated] = useState<Generated | null>(null);

  const lookback = strategy === "custom" ? rulesLookback(rules) : LOOKBACK_HOURS;
  const fromIndex = market.hours - BACKTEST_HOURS;
  const ruleErrors = strategy === "custom" ? parseRules(rules).errors : [];

  const backtest = useMemo(() => {
    if (!symbols.length || ruleErrors.length) return null;
    const series = Object.fromEntries(symbols.map((symbol) => [symbol, market.tokens.find((token) => token.symbol === symbol)!.closes]));
    const result = simulate({
      series,
      params: { strategy, rules: strategy === "custom" ? rules : undefined, maxPositionPct, stopLossPct, ...(perps ? { venue: "perps" as const } : {}) },
      capital: agentCapital,
      fromIndex,
      times: market.tokens[0].closes.map((_, i) => market.startTs + i * 3600),
      // Perps pay 0.05% per fill and each hour's real funding, like the live Lab perps agents.
      ...(perps ? { funding: Object.fromEntries(symbols.map((symbol) => [symbol, market.tokens.find((token) => token.symbol === symbol)!.funding ?? []])) } : {}),
    });
    const hold = buyAndHold(series, agentCapital, fromIndex);
    return { result, hold, edge: result.returnPct - hold.returnPct };
  }, [symbols, strategy, rules, maxPositionPct, stopLossPct, agentCapital, market, fromIndex, ruleErrors.length, perps]);

  const toggleSymbol = (symbol: string) => setSymbols((list) => (list.includes(symbol) ? list.filter((item) => item !== symbol) : list.length >= maxMarkets ? list : [...list, symbol]));

  /** A new strategy keeps the picked markets that fit its limit; paper-only strategies switch real money off. */
  const chooseStrategy = (next: Strategy) => {
    setStrategy(next);
    setSymbols((list) => list.slice(0, maxMarketsFor(next)));
    if (PAPER_ONLY_STRATEGIES.includes(next)) setMode("paper");
  };

  /** Spot and perps have different markets: switching starts the pick over (perps also means paper only). */
  const chooseVenue = (next: Venue) => {
    if (next === venue) return;
    setVenue(next);
    const first = market.tokens.find((token) => (token.venue === "lighter") === (next === "perps") && token.symbol === (next === "perps" ? "BTC-PERP" : "NVDA"));
    setSymbols(first ? [first.symbol] : []);
    if (next === "perps") setMode("paper");
    if (next === "spot" && strategyNeedsPerps(strategy)) setStrategy("momentum");
  };

  const launchRef = useRef<HTMLDialogElement>(null);
  const [launch, setLaunch] = useState<{ busy: boolean; error: string | null; terms: boolean; residence: boolean; risk: boolean }>({ busy: false, error: null, terms: false, residence: false, risk: false });

  const openLaunch = () => {
    setShowErrors(true);
    if (!agentName.trim() || !symbols.length || ruleErrors.length || (!live && aiLimitError)) {
      const target = !agentName.trim() ? "agent-name" : !symbols.length ? "token-grid" : ruleErrors.length ? "rule-builder" : "ai-label";
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const show = () => {
      setLaunch({ busy: false, error: null, terms: false, residence: false, risk: false });
      launchRef.current?.showModal();
    };
    track("launch_click", address ? undefined : "logged_out");
    if (!address) openLogin(show);
    else show();
  };

  const submitLaunch = async () => {
    if (!launch.terms || !launch.residence || (live && !launch.risk)) {
      setLaunch((state) => ({ ...state, error: live ? "Please tick all three boxes to continue." : "Please tick both boxes to continue." }));
      return;
    }
    setLaunch((state) => ({ ...state, busy: true, error: null }));
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: agentName.trim(),
        strategy,
        rules: strategy === "custom" ? rules : undefined,
        tokens: symbols.map((symbol) => market.tokens.find((token) => token.symbol === symbol)!.address),
        venue,
        capital: agentCapital,
        maxPositionPct,
        stopLossPct,
        acceptTerms: true,
        mode,
        // Real money agents trade on their rules alone.
        aiModel: live ? null : aiModelId,
        aiLimitUsd: aiModelId && !live ? Number(aiLimit.usd) : undefined,
        aiExpiryDays: aiModelId && !live ? aiLimit.days : undefined,
        // Only a prompt that actually produced these rules is kept.
        strategyPrompt: strategy === "custom" && customMode === "prompt" ? generated?.prompt : undefined,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok || !body.id) {
      setLaunch((state) => ({ ...state, busy: false, error: body.error ?? "Launching failed. Please try again." }));
      return;
    }
    launchRef.current?.close();
    track("launch_ok", mode);
    toast(live ? "Real money agent launched. Its first decision comes at the top of the next hour." : "Agent launched. It stays private until you publish it to the leaderboard.");
    router.push(`/agents/${body.id}`);
    router.refresh();
  };

  const nameMissing = showErrors && !agentName.trim();
  const last = market.hours - 1;

  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Agent Studio</h1>
          <p className="page__lead">Shape your agent and watch the last 30 days replay with your exact settings.</p>
          {template && (
            <p className="studio-template">
              <i className="ph ph-copy" aria-hidden="true" />
              Starting from the rules of <Link href={`/agents/${template.id}`}>{template.name}</Link>. Change anything, then give it your own name.
            </p>
          )}
        </div>
      </div>

      <div className="studio">
        <form className="card" noValidate onSubmit={(event) => event.preventDefault()}>
          {!template && presets.length > 0 && (
            <div className="form-section" role="radiogroup" aria-labelledby="preset-label">
              <div className="form-section__label" id="preset-label">
                Start from <span className="form-section__hint">Last 30 days with each one&apos;s settings, then change anything</span>
              </div>
              <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                {presets.map((preset) => {
                  const picked = strategy === preset.strategy && symbols.length === preset.symbols.length && preset.symbols.every((symbol) => symbols.includes(symbol));
                  return (
                    <label key={preset.id} className="choice">
                      <input type="radio" name="preset" value={preset.id} checked={picked} onChange={() => applyPreset(preset)} />
                      <span className="choice__title">{preset.title}</span>
                      <span className="choice__text">{preset.text}</span>
                      <span className="preset__result">
                        <strong className={preset.returnPct > 0.05 ? "gain" : preset.returnPct < -0.05 ? "loss" : ""}>{percent(preset.returnPct)}</strong>
                        <span className="muted">holding {percent(preset.holdPct)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="form-section">
            <label className="form-section__label" htmlFor="agent-name">
              Name <span className="form-section__hint">Shown on the leaderboard</span>
            </label>
            <input
              className="input"
              id="agent-name"
              maxLength={40}
              placeholder="Night Owl NVDA"
              value={agentName}
              autoComplete="off"
              aria-invalid={nameMissing}
              onChange={(event) => {
                setNameTouched(true);
                setName(event.target.value);
              }}
            />
            {nameMissing && <span className="field-error">Give your agent a name first.</span>}
          </div>

          <div className="form-section" role="radiogroup" aria-labelledby="mode-label">
            <div className="form-section__label" id="mode-label">
              Trading mode
            </div>
            <div className="choice-grid">
              <label className="choice">
                <input type="radio" name="mode" value="paper" checked={!live} onChange={() => setMode("paper")} />
                <span className="choice__glyph" aria-hidden="true">
                  <i className="ph ph-flask" />
                </span>
                <span className="choice__title">Paper trading</span>
                <span className="choice__text">Virtual money at real Robinhood Chain prices. Free, nothing to deposit.</span>
              </label>
              <label className="choice" aria-disabled={perps || PAPER_ONLY_STRATEGIES.includes(strategy)}>
                <input type="radio" name="mode" value="live" checked={live} disabled={perps || PAPER_ONLY_STRATEGIES.includes(strategy)} onChange={() => setMode("live")} />
                <span className="choice__glyph" aria-hidden="true">
                  <i className="ph ph-wallet" />
                </span>
                <span className="choice__title">
                  Real money
                  {/* The per agent cap from live settings; 100 until LiveSetup has loaded them. */}
                  <span className="pill pill--accent">Up to ${Math.round(liveStatus?.maxCapitalUsd ?? 100)}</span>
                </span>
                <span className="choice__text">
                  {perps
                    ? "Not for perps yet: perps agents trade paper money."
                    : PAPER_ONLY_STRATEGIES.includes(strategy)
                      ? "Not for Dip hunter or Spike fade yet: they trade paper money."
                      : "Your agent trades USDG from your own wallet on Uniswap, within limits, and you can stop it any time."}
                </span>
              </label>
            </div>
            {live && <LiveSetup onStatus={setLiveStatus} />}
          </div>

          <div className="form-section" role="radiogroup" aria-labelledby="venue-label">
            <div className="form-section__label" id="venue-label">
              Markets to trade
            </div>
            <div className="choice-grid">
              <label className="choice">
                <input type="radio" name="venue" value="spot" checked={!perps} onChange={() => chooseVenue("spot")} />
                <span className="choice__glyph" aria-hidden="true">
                  <i className="ph ph-chart-line-up" />
                </span>
                <span className="choice__title">Spot</span>
                <span className="choice__text">Stock tokens and crypto on Robinhood Chain&apos;s DEX. Long only.</span>
              </label>
              <label className="choice">
                <input type="radio" name="venue" value="perps" checked={perps} onChange={() => chooseVenue("perps")} />
                <span className="choice__glyph" aria-hidden="true">
                  <i className="ph ph-arrows-down-up" />
                </span>
                <span className="choice__title">
                  Perps <span className="pill">Paper</span>
                </span>
                <span className="choice__text">Lighter perps on Robinhood Chain with real hourly funding. Long, or short with Spike fade.</span>
              </label>
            </div>
          </div>

          <div className="form-section" role="radiogroup" aria-labelledby="strategy-label">
            <div className="form-section__label" id="strategy-label">
              Strategy
            </div>
            <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <StrategyChoice value="momentum" current={strategy} onChange={chooseStrategy} icon="momentum" title="Momentum" text="Buys after a rise of more than 3% in a day, sells when the trend breaks." />
              <StrategyChoice value="mean_reversion" current={strategy} onChange={chooseStrategy} icon="mean-reversion" title="Mean reversion" text="Buys unusual dips and sells the rebound once the price is back to normal." />
              <StrategyChoice value="custom" current={strategy} onChange={chooseStrategy} icon="backtest" title="Custom" text="Write your own buy and sell rules from price lines, z scores and RSI." />
              <StrategyChoice value="dip_hunter" current={strategy} onChange={chooseStrategy} glyph="ph-arrow-down-right" title="Dip hunter" text="Watches up to 8 markets and buys only the deepest dip, one at a time. Paper only." />
              <StrategyChoice
                value="spike_fade"
                current={strategy}
                onChange={chooseStrategy}
                glyph="ph-arrow-up-right"
                title="Spike fade"
                text={perps ? "Shorts the strongest spike among up to 8 perps, one at a time. Paper only." : "Shorts the strongest spike. Perps only: switch Markets to trade to Perps."}
                disabled={!perps}
              />
            </div>
          </div>

          {strategy === "custom" && (
            <PromptWriter
              mode={customMode}
              onModeChange={setCustomMode}
              generated={generated}
              // Unknown credits (null) right after a login are not "out of credits"; the server checks anyway.
              hasCredits={credits === null || credits.freeUsd + credits.paidUsd > 0.001}
              copilotOn={aiModelId !== null}
              onGenerated={({ rules: next, prompt, summary, notes }) => {
                setRules(next);
                setGenerated({ prompt, summary, notes });
                // Fresh balance from the server; the form state stays as it is.
                router.refresh();
              }}
            />
          )}
          {strategy === "custom" && <RuleBuilder rules={rules} onChange={setRules} errors={showErrors ? ruleErrors : []} />}

          {!live && (
          <AiCopilotPicker
            value={aiModelId}
            onChange={chooseAiModel}
            credits={credits}
            limit={aiLimit}
            onLimitChange={(next) => {
              setAiLimitTouched(true);
              setAiLimit(next);
            }}
            limitError={showErrors ? aiLimitError : null}
          />
          )}

          <div className="form-section">
            <div className="form-section__label">
              Markets <span className="form-section__hint">{symbols.length} of {maxMarkets} picked{perps ? ", Lighter perps" : ", stocks and crypto can mix"}</span>
            </div>
            <div className="token-grid" id="token-grid">
              {(perps ? ([["perps", "Perps"]] as const) : TOKEN_GROUPS).flatMap(([group, groupLabel]) => [
                <span key={group} className="token-grid__label">
                  {groupLabel}
                </span>,
                ...venueTokens.filter((token) => perps || token.assetClass === group).map((token) => {
                  const history = token.firstIndex === null ? 0 : market.hours - token.firstIndex;
                  const tooNew = history < BACKTEST_HOURS + lookback;
                  const selected = symbols.includes(token.symbol);
                  const full = symbols.length >= maxMarkets && !selected;
                  const now = token.closes[last];
                  const dayAgo = token.closes[Math.max(token.firstIndex ?? 0, last - 24)];
                  const change = now && dayAgo ? (now / dayAgo - 1) * 100 : 0;
                  return (
                    <button
                      key={token.address}
                      className="token"
                      type="button"
                      aria-pressed={selected}
                      disabled={tooNew || full}
                      title={tooNew ? `Listed ${Math.max(1, Math.round(history / 24))} days ago. Needs ${Math.ceil((BACKTEST_HOURS + lookback) / 24)} days of history.` : full ? `You can pick up to ${maxMarkets}` : token.name}
                      onClick={() => toggleSymbol(token.symbol)}
                    >
                      <span className="token__row">
                        <span className="token__symbol">
                          <TickerAvatar symbol={token.symbol} size={20} />
                          {token.symbol}
                        </span>
                        <span className={tooNew ? "" : change > 0.05 ? "gain" : change < -0.05 ? "loss" : ""}>{tooNew ? "New" : percent(change)}</span>
                      </span>
                      <span className="token__name">{tooNew ? "Too new to backtest" : token.name}</span>
                    </button>
                  );
                }),
              ])}
            </div>
            {showErrors && !symbols.length && <span className="field-error">Pick at least one stock or coin.</span>}
          </div>

          {live ? (
          <div className="form-section">
            <label className="form-section__label" htmlFor="live-capital">
              Real capital <span className="form-section__hint">USDG from your wallet, $10 to ${liveCap}</span>
            </label>
            <input
              className="input mono"
              id="live-capital"
              type="number"
              min={10}
              max={liveCap}
              step={1}
              value={liveCapital}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) setLiveCapital(Math.max(0, value));
              }}
            />
            {showErrors && (liveCapital < 10 || liveCapital > liveCap) && <span className="field-error">Pick between $10 and ${liveCap}.</span>}
          </div>
          ) : (
          <div className="form-section">
            <label className="form-section__label" htmlFor="capital">
              Virtual capital <span className="form-section__hint">Play money, in USD</span>
            </label>
            <input
              className="input mono"
              id="capital"
              type="number"
              min={1000}
              max={1_000_000}
              step={1000}
              defaultValue={capital}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 1000) setCapital(Math.min(value, 1_000_000));
              }}
            />
          </div>
          )}

          <div className="form-section">
            <label className="form-section__label" htmlFor="max-position">
              Max per token <span className="form-section__hint">Share of the agent&apos;s money in one stock or coin</span>
            </label>
            <div className="range">
              <input id="max-position" type="range" min={10} max={100} step={1} value={maxPositionPct} onChange={(event) => setMaxPositionPct(Number(event.target.value))} />
              <output htmlFor="max-position">{maxPositionPct}%</output>
            </div>
          </div>

          <div className="form-section">
            <label className="form-section__label" htmlFor="stop-loss">
              Stop loss <span className="form-section__hint">Sell when a position falls this far</span>
            </label>
            <div className="range">
              <input id="stop-loss" type="range" min={2} max={25} step={1} value={stopLossPct} onChange={(event) => setStopLossPct(Number(event.target.value))} />
              <output htmlFor="stop-loss">{stopLossPct}%</output>
            </div>
            <p className="note">
              <i className="ph ph-info" />
              Checked once an hour, so a fast drop can go past it.
            </p>
          </div>
        </form>

        <aside className="studio__result" aria-live="polite">
          {!symbols.length || !backtest ? (
            <div className="card">
              <div className="empty">
                <img src="/img/icons/backtest.png" alt="" width={72} height={72} />
                <h2 className="card__title">{ruleErrors.length ? "Finish your rules to see the backtest" : "Pick a market to see the backtest"}</h2>
                <p>{ruleErrors.length ? ruleErrors[0] : `Choose up to ${maxMarkets} markets and the last 30 days replay here instantly.`}</p>
              </div>
            </div>
          ) : (
            <BacktestCard backtest={backtest} capital={capital} startTs={market.startTs + fromIndex * 3600} endTs={market.startTs + last * 3600} strategy={strategy} perps={perps} onLaunch={openLaunch} />
          )}
        </aside>
      </div>

      <dialog ref={launchRef} className="modal" aria-labelledby="launch-title">
        <form
          className="modal__body"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submitLaunch();
          }}
        >
          <img className="modal__icon" src="/img/brand/zolva-mark.png" alt="" width={56} height={56} />
          <h2 className="modal__title" id="launch-title">
            Launch {agentName.trim()}
          </h2>
          <p className="muted">
            {live
              ? `It trades ${usd(agentCapital)} of real USDG from your wallet on Uniswap. Its first decision comes at the top of the next hour.`
              : "It trades virtual money only. Its first decision comes at the top of the next hour."}
          </p>
          {live ? (
            <div className="verdict">
              <i className={`ph ${liveReady(liveStatus) ? "ph-wallet" : "ph-warning-circle loss"}`} />
              <span>
                {liveReady(liveStatus)
                  ? "One real money agent at a time. Stop it or sell its holdings from its page whenever you want."
                  : "Finish the real money steps first: allow Zolva, then fund your wallet with USDG and a little ETH."}
              </span>
            </div>
          ) : activeCount >= MAX_ACTIVE ? (
            <div className="verdict">
              <i className="ph ph-warning-circle loss" />
              <span>You already run {MAX_ACTIVE} agents, the most at once. Pause one in your dashboard to launch another.</span>
            </div>
          ) : (
            <div className="verdict">
              <i className="ph ph-robot" />
              <span>
                This will be agent {activeCount + 1} of {MAX_ACTIVE} running. Each starts with its own virtual capital.
              </span>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={launch.terms} onChange={(event) => setLaunch((state) => ({ ...state, terms: event.target.checked }))} />
            <span>
              I accept the{" "}
              <a href="/terms" target="_blank">
                terms
              </a>
              {live ? "." : " and understand this is paper trading with virtual money."}
            </span>
          </label>
          {live && (
            <label className="check">
              <input type="checkbox" checked={launch.risk} onChange={(event) => setLaunch((state) => ({ ...state, risk: event.target.checked }))} />
              <span>I understand this trades my own money, that I can lose some or all of it, and that past results and backtests do not predict future returns.</span>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={launch.residence} onChange={(event) => setLaunch((state) => ({ ...state, residence: event.target.checked }))} />
            <span>I am not a US person and not resident in a sanctioned country.</span>
          </label>
          {launch.error && <span className="field-error">{launch.error}</span>}
          <div className="modal__actions">
            <button className="button button--ghost" type="button" onClick={() => launchRef.current?.close()}>
              Cancel
            </button>
            <button className="button button--primary" type="submit" disabled={launch.busy || (live ? !liveReady(liveStatus) || agentCapital < 10 : activeCount >= MAX_ACTIVE)}>
              {launch.busy ? "Launching…" : live ? "Launch with real money" : "Launch agent"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function StrategyChoice(props: { value: Strategy; current: Strategy; onChange: (value: Strategy) => void; icon?: string; glyph?: string; title: string; text: string; disabled?: boolean }) {
  return (
    <label className="choice" aria-disabled={props.disabled}>
      <input type="radio" name="strategy" value={props.value} checked={props.current === props.value} disabled={props.disabled} onChange={() => props.onChange(props.value)} />
      {props.glyph ? (
        <span className="choice__glyph" aria-hidden="true">
          <i className={`ph ${props.glyph}`} />
        </span>
      ) : (
        <img className="choice__icon" src={`/img/icons/${props.icon}.png`} alt="" width={44} height={44} />
      )}
      <span className="choice__title">{props.title}</span>
      <span className="choice__text">{props.text}</span>
    </label>
  );
}

type BacktestView = { result: ReturnType<typeof simulate>; hold: ReturnType<typeof buyAndHold>; edge: number };

function BacktestCard({ backtest, capital, startTs, endTs, strategy, perps, onLaunch }: { backtest: BacktestView; capital: number; startTs: number; endTs: number; strategy: Strategy; perps: boolean; onLaunch: () => void }) {
  const { result, hold, edge } = backtest;
  const tradesPerWeek = (result.fills.length / 30) * 7;
  let verdict: { icon: string; text: string };
  if (result.returnPct > 0 && edge >= 0) verdict = { icon: "ph-fill ph-check-circle gain", text: `Beat simply holding these markets by ${Math.abs(edge).toFixed(1)} points over 30 days.` };
  else if (result.returnPct > 0) verdict = { icon: "ph-fill ph-minus-circle", text: `Made money, but holding the same markets did ${Math.abs(edge).toFixed(1)} points better.` };
  else if (edge >= 0) verdict = { icon: "ph-fill ph-shield-check", text: `Lost ${percent(result.returnPct, { signed: false })}, but lost less than holding, which returned ${percent(hold.returnPct)}.` };
  else verdict = { icon: "ph-fill ph-warning-circle loss", text: `Lost ${percent(result.returnPct, { signed: false })} while holding returned ${percent(hold.returnPct)}. Try another strategy or other markets.` };

  return (
    <div className="card result-card">
      <div className="result-head">
        <div>
          <div className="eyebrow">
            Last 30 days, {dayAt(startTs)} to {dayAt(endTs)}
          </div>
          <div className={`big-number ${result.returnPct > 0.05 ? "gain" : result.returnPct < -0.05 ? "loss" : ""}`}>{percent(result.returnPct)}</div>
        </div>
        <div className="result-head__aside">
          <div className="eyebrow">Holding instead</div>
          <div className="mono" style={{ fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>
            {percent(hold.returnPct)}
          </div>
        </div>
      </div>

      <LineChart
        startTs={startTs}
        height={200}
        baseline={capital}
        series={[
          { label: "Your agent", values: result.runs.map((run) => run.equity), color: "var(--color-purple-rich)" },
          { label: "Holding", values: hold.curve, color: "var(--color-hold-line)", dashed: true },
        ]}
      />

      <div className="verdict">
        <i className={`ph ${verdict.icon}`} />
        <span>{verdict.text}</span>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat__label">Ending value</span>
          <span className="stat__value">{usd(result.finalEquity)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Worst drop</span>
          <span className="stat__value">{percent(-result.maxDrawdownPct)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Trades</span>
          <span className="stat__value">{result.fills.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">{strategy === "spike_fade" ? "Winning closes" : "Winning sells"}</span>
          <span className="stat__value">{result.winRatePct === null ? "None yet" : percent(result.winRatePct, { signed: false, digits: 0 })}</span>
        </div>
      </div>

      {tradesPerWeek > 14 && (
        <p className="note">
          <i className="ph ph-warning" />
          About {Math.round(tradesPerWeek)} trades a week. Each one costs 0.5%, which adds up fast.
        </p>
      )}
      {strategy === "custom" && edge > 10 && (
        <p className="note">
          <i className="ph ph-warning" />
          A strong backtest for rules tuned on this exact month. Results after launch are what count on the leaderboard.
        </p>
      )}

      <button className="button button--primary button--large" type="button" onClick={onLaunch}>
        Launch agent
        <i className="ph ph-rocket-launch" />
      </button>
      <p className="note">
        <i className="ph ph-info" />
        {perps ? "Real hourly Lighter prices with 0.05% cost per trade plus each hour’s real funding." : "Real hourly prices with 0.5% cost per trade."} Past results do not predict future ones.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom rule builder
// ---------------------------------------------------------------------------

const KIND_ORDER: IndicatorKind[] = ["price", "sma", "high", "low", "change", "zscore", "rsi"];
const PRICE_KINDS: IndicatorKind[] = ["price", "sma", "high", "low"];

// One line of plain language under each choice in the rule dropdowns.
const INDICATOR_HINTS: Record<IndicatorKind, string> = {
  price: "The latest hourly price",
  sma: "Average price over a period",
  high: "Highest price in a period",
  low: "Lowest price in a period",
  change: "Percent move over a period",
  zscore: "How far price is from normal",
  rsi: "Momentum from 0 to 100",
};
const OPERATOR_HINTS: Record<Operator, string> = {
  above: "Is higher than",
  below: "Is lower than",
  crossesAbove: "Moves from below to above this hour",
  crossesBelow: "Moves from above to below this hour",
};
const JOIN_OPTIONS: SelectOption<RuleGroup["join"]>[] = [
  { value: "all", label: "all", hint: "Every rule must be true" },
  { value: "any", label: "any", hint: "One true rule is enough" },
];
const OPERATOR_OPTIONS: SelectOption<Operator>[] = (Object.keys(OPERATORS) as Operator[]).map((op) => ({ value: op, label: OPERATORS[op], hint: OPERATOR_HINTS[op] }));
const DEFAULT_VALUE: Record<string, number> = { pct: 3, z: -2, rsi: 30 };

function RuleBuilder({ rules, onChange, errors }: { rules: Rules; onChange: (rules: Rules) => void; errors: string[] }) {
  // The highlighted template follows the rules, so hand edits show as "Edited".
  const template = useMemo(() => {
    const match = Object.entries(RULE_TEMPLATES).find(([, value]) => JSON.stringify(value) === JSON.stringify(rules));
    return match ? match[0] : JSON.stringify(rules) === JSON.stringify(BLANK_RULES) ? "blank" : "edited";
  }, [rules]);

  const setGroup = (side: "entry" | "exit", group: RuleGroup) => onChange({ ...rules, [side]: group });

  return (
    <div className="form-section" id="rule-builder">
      <div className="form-section__label">
        Your rules <span className="form-section__hint">{template === "edited" ? "Edited" : "Start from a template"}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Rule templates" style={{ flexWrap: "wrap", width: "fit-content" }}>
        {(
          [
            ["momentum", "Momentum"],
            ["mean_reversion", "Mean reversion"],
            ["breakout", "Breakout"],
            ["blank", "Blank"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="tab"
            type="button"
            role="tab"
            aria-selected={template === key}
            onClick={() => onChange(clone(key === "blank" ? BLANK_RULES : RULE_TEMPLATES[key]))}
          >
            {label}
          </button>
        ))}
      </div>

      <GroupEditor title="Buy when" group={rules.entry} onChange={(group) => setGroup("entry", group)} />
      <GroupEditor title="Sell when" group={rules.exit} onChange={(group) => setGroup("exit", group)} />

      <div className="choice-grid">
        <label className="stack stack--tight" style={{ gap: "var(--space-50)" }}>
          <span className="form-section__hint">Take profit (%), optional</span>
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            placeholder="Off"
            value={rules.takeProfitPct ?? ""}
            onChange={(event) => onChange({ ...rules, takeProfitPct: event.target.value === "" ? null : Number(event.target.value) })}
          />
        </label>
        <label className="stack stack--tight" style={{ gap: "var(--space-50)" }}>
          <span className="form-section__hint">Max holding time (hours), optional</span>
          <input
            className="input"
            type="number"
            min={1}
            max={720}
            placeholder="Off"
            value={rules.maxHoldHours ?? ""}
            onChange={(event) => onChange({ ...rules, maxHoldHours: event.target.value === "" ? null : Number(event.target.value) })}
          />
        </label>
      </div>
      {errors.map((error) => (
        <span key={error} className="field-error">
          {error}
        </span>
      ))}
    </div>
  );
}

function GroupEditor({ title, group, onChange }: { title: string; group: RuleGroup; onChange: (group: RuleGroup) => void }) {
  const update = (index: number, condition: Condition) => onChange({ ...group, conditions: group.conditions.map((item, i) => (i === index ? condition : item)) });
  return (
    <div className="card" style={{ padding: "var(--space-200)", background: "var(--color-bg-subtle)", border: 0 }}>
      <div className="card-head" style={{ marginBottom: "var(--space-100)" }}>
        <strong style={{ fontSize: 14 }}>
          {title}{" "}
          <Select variant="inline" value={group.join} options={JOIN_OPTIONS} onChange={(join) => onChange({ ...group, join })} label={`${title}: all or any`} />{" "}
          of these are true
        </strong>
      </div>
      <div className="stack stack--tight">
        {group.conditions.map((condition, index) => (
          <ConditionRow key={index} condition={condition} onChange={(next) => update(index, next)} onRemove={() => onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) })} />
        ))}
        {group.conditions.length === 0 && <p className="note">No rule here. Use take profit, max holding time or the stop loss to sell.</p>}
        {group.conditions.length < MAX_CONDITIONS && (
          <button
            className="button button--ghost button--small"
            type="button"
            style={{ width: "fit-content" }}
            onClick={() => onChange({ ...group, conditions: [...group.conditions, { left: { kind: "change", hours: 24 }, op: "above", right: { kind: "value", value: 3 } }] })}
          >
            <i className="ph ph-plus" />
            Add rule
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ condition, onChange, onRemove }: { condition: Condition; onChange: (condition: Condition) => void; onRemove: () => void }) {
  const leftUnit = INDICATORS[condition.left.kind].unit;

  const setLeft = (kind: IndicatorKind) => {
    const periods = INDICATORS[kind].periods;
    const left = { kind, ...(periods ? { hours: periods.includes(24) ? 24 : periods[0] } : {}) };
    const unit = INDICATORS[kind].unit;
    // Switching between a price line and a value changes what the right side can be.
    const right: Condition["right"] =
      unit === "price"
        ? condition.right.kind === "value"
          ? { kind: "sma", hours: 48 }
          : condition.right
        : { kind: "value", value: DEFAULT_VALUE[unit] ?? 0 };
    onChange({ ...condition, left, right });
  };

  return (
    <div className="rule-row">
      <IndicatorPicker kinds={KIND_ORDER} indicator={condition.left} onChange={(left) => (left.kind !== condition.left.kind ? setLeft(left.kind) : onChange({ ...condition, left }))} />
      <Select value={condition.op} options={OPERATOR_OPTIONS} onChange={(op) => onChange({ ...condition, op })} label="Comparison" />
      {leftUnit === "price" ? (
        <>
          <IndicatorPicker kinds={PRICE_KINDS} indicator={condition.right.kind === "value" ? { kind: "sma", hours: 48 } : condition.right} onChange={(right) => onChange({ ...condition, right: { ...right, offsetPct: condition.right.kind !== "value" ? condition.right.offsetPct : undefined } })} />
          <label className="rule-offset">
            <input
              className="rule-input"
              type="number"
              step={0.5}
              value={condition.right.kind !== "value" ? (condition.right.offsetPct ?? 0) : 0}
              aria-label="Offset in percent"
              onChange={(event) => condition.right.kind !== "value" && onChange({ ...condition, right: { ...condition.right, offsetPct: Number(event.target.value) || undefined } })}
            />
            %
          </label>
        </>
      ) : (
        <label className="rule-offset">
          <input
            className="rule-input"
            type="number"
            step={leftUnit === "z" ? 0.1 : 0.5}
            value={condition.right.kind === "value" ? condition.right.value : 0}
            aria-label="Value"
            onChange={(event) => onChange({ ...condition, right: { kind: "value", value: Number(event.target.value) } })}
          />
          {leftUnit === "pct" ? "%" : ""}
        </label>
      )}
      <button className="privy__icon-button" type="button" aria-label="Remove rule" onClick={onRemove}>
        <i className="ph ph-x" />
      </button>
    </div>
  );
}

function IndicatorPicker({ kinds, indicator, onChange }: { kinds: IndicatorKind[]; indicator: { kind: IndicatorKind; hours?: number }; onChange: (indicator: { kind: IndicatorKind; hours?: number }) => void }) {
  const periods = INDICATORS[indicator.kind].periods;
  return (
    <span className="rule-picker">
      <Select
        value={indicator.kind}
        label="Indicator"
        options={kinds.map((kind) => ({ value: kind, label: INDICATORS[kind].label, hint: INDICATOR_HINTS[kind] }))}
        onChange={(kind) => {
          const next = INDICATORS[kind].periods;
          onChange({ kind, ...(next ? { hours: next.includes(indicator.hours ?? -1) ? indicator.hours : next.includes(24) ? 24 : next[0] } : {}) });
        }}
      />
      {periods && indicator.hours !== undefined && (
        <Select
          value={indicator.hours}
          label="Period"
          options={periods.map((hours) => ({ value: hours, label: `${hours}h`, hint: hours === 1 ? "Last hour" : `Last ${hours} hours` }))}
          onChange={(hours) => onChange({ kind: indicator.kind, hours })}
        />
      )}
    </span>
  );
}
