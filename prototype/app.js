// Sita prototype: hash router + pages. No build step, no packages.
// Sample agents are computed live by engine.js on real hourly prices, so every
// number on screen is a real calculation, only the agents themselves are invented.
(function () {
  "use strict";

  const DATA = window.PITWISE_DATA;
  const Engine = window.SitaEngine;
  const HOUR_MS = 3600 * 1000;
  const LAST_INDEX = DATA.hours - 1;
  const BACKTEST_HOURS = 30 * 24;
  const STORAGE_KEY = "pitwise.prototype.v1";
  // Same limit as the database trigger (supabase/migrations/..._active_agent_limit.sql).
  const MAX_ACTIVE_AGENTS = 5;
  const DEMO_WALLET = "0x4c1f8a27d3b9e06f5a1c7e2d9b84f63a0e5d9e27";
  // Address Privy would create for an email or Google user (prototype value).
  const EMBEDDED_WALLET = "0x7b2e94c1d05a3f86e2b17c9d40a5e3f18c62d4a9";

  const tokensBySymbol = Object.fromEntries(DATA.tokens.map((token) => [token.symbol, token]));
  const main = document.getElementById("main");

  // ---------------------------------------------------------------------------
  // Sample agents (invented owners and names, real prices)
  // ---------------------------------------------------------------------------

  const SAMPLE_AGENTS = [
    { id: "dip-collector", name: "Dip Collector", owner: "0x9a3e51c07f2b4d18e6a0c3b7d25f914e8c06b1d4", strategy: "mean_reversion", symbols: ["META", "AAPL", "GOOGL"], days: 31, maxPositionPct: 33, stopLossPct: 6 },
    { id: "chip-trend", name: "Chip Trend", owner: "0x27bd0c94e1a85f3d6c2e70b9a4f18d53e6c9a0f2", strategy: "momentum", symbols: ["NVDA", "MU", "TSM"], days: 24, maxPositionPct: 33, stopLossPct: 8 },
    { id: "night-shift", name: "Meme Stock Night Shift", owner: "0xe04f7a2c9d61b385a0e4c7f2d9b16a38c5e07d91", strategy: "mean_reversion", symbols: ["GME", "AMC"], days: 18, maxPositionPct: 45, stopLossPct: 12 },
    { id: "steady-index", name: "Steady Index", owner: "0x5c8e2a1f07d943b6e0a8c5f27d1b94e3a6c08f52", strategy: "mean_reversion", symbols: ["SPY", "QQQ"], days: 33, maxPositionPct: 50, stopLossPct: 4 },
    { id: "palantir-runner", name: "Palantir Runner", owner: "0xb6a14e9c0d38f27a5e1c6b9d04f83a27e5c1d0b8", strategy: "momentum", symbols: ["PLTR"], days: 21, maxPositionPct: 80, stopLossPct: 9 },
    { id: "gold-patience", name: "Gold Bug Patience", owner: "0x81d3f0a6c27e94b5d0e3a8c1f6b27d49e0a5c3f7", strategy: "mean_reversion", symbols: ["GLD", "USO"], days: 27, maxPositionPct: 40, stopLossPct: 5 },
    { id: "rocket-ride", name: "Rocket Ride", owner: "0x3e9a07c5d1f24b86e9a3c0d7f15b28e4a9c6d0e1", strategy: "momentum", symbols: ["SPCX", "TSLA"], days: 14, maxPositionPct: 45, stopLossPct: 10 },
    { id: "crypto-adjacent", name: "Crypto Adjacent", owner: "0xd7c02b8e5a19f36d0c4e7a2b9f81d53c6e0a4b29", strategy: "momentum", symbols: ["MSTR", "CRCL"], days: 29, maxPositionPct: 40, stopLossPct: 7 },
    { id: "reddit-moods", name: "Reddit Mood Swings", owner: "0x6f1b39d0e8a27c54f0b9d2e6a13c85f7d0e2a6c4", strategy: "mean_reversion", symbols: ["RDDT"], days: 20, maxPositionPct: 70, stopLossPct: 10 },
    { id: "mag-momentum", name: "Mag Seven Momentum", owner: "0xa20e6d5c9f17b38e4a0c6d1f92b57e3a8c04d6f1", strategy: "momentum", symbols: ["META", "AMZN", "GOOGL"], days: 32, maxPositionPct: 33, stopLossPct: 6 },
    { id: "oil-swing", name: "Oil Swing", owner: "0x14c8e2a7d05f93b6c1e8a4d27f0b65c3e9a1d7b2", strategy: "momentum", symbols: ["USO"], days: 10, maxPositionPct: 60, stopLossPct: 5 },
    { id: "fab-floor", name: "Fab Floor", owner: "0xc93a5e0d7b21f48c6e0a3d9b15f72e4c8a06d3e5", strategy: "mean_reversion", symbols: ["MU", "TSM", "NVDA"], days: 16, maxPositionPct: 33, stopLossPct: 8 },
  ].map((agent) => ({ ...agent, capital: 10000, status: "active", fromIndex: LAST_INDEX - agent.days * 24 }));

  // ---------------------------------------------------------------------------
  // State (only the visitor's own agent and sign in are remembered)
  // ---------------------------------------------------------------------------

  const state = loadState();

  function loadState() {
    const fallback = { user: null, myAgents: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.myAgents)) return fallback;
      // Older prototype versions only stored "signedIn" for a wallet login.
      if (saved.signedIn && !saved.user) saved.user = { method: "wallet", wallet: DEMO_WALLET, walletKind: "metamask" };
      delete saved.signedIn;
      return saved;
    } catch {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private windows can block storage; the prototype still works for this visit.
    }
  }

  function activeAgentCount() {
    return state.myAgents.filter((agent) => agent.status === "active").length;
  }

  function myCurrentAgent() {
    return state.myAgents[state.myAgents.length - 1] || null;
  }

  /** The visitor's agent "starts" now; the prototype can skip ahead to show it with history. */
  function myAgentView(agent) {
    return { ...agent, owner: userWallet(), isMine: true, fromIndex: LAST_INDEX - agent.skippedHours + 1 };
  }

  // ---------------------------------------------------------------------------
  // Engine helpers
  // ---------------------------------------------------------------------------

  const resultCache = new Map();

  function runAgent(agent) {
    const key = [agent.id, agent.strategy, agent.symbols.join(","), agent.capital, agent.maxPositionPct, agent.stopLossPct, agent.fromIndex].join("|");
    if (resultCache.has(key)) return resultCache.get(key);
    const tokens = agent.symbols.map((symbol) => tokensBySymbol[symbol]);
    const hasHistory = agent.fromIndex <= LAST_INDEX;
    const result = hasHistory
      ? Engine.simulate({
          tokens,
          strategy: agent.strategy,
          capital: agent.capital,
          maxPositionPct: agent.maxPositionPct,
          stopLossPct: agent.stopLossPct,
          fromIndex: agent.fromIndex,
        })
      : null;
    const hold = hasHistory ? Engine.buyAndHold(tokens, agent.capital, agent.fromIndex) : null;
    const value = { result, hold, edge: result ? result.returnPct - hold.returnPct : 0 };
    resultCache.set(key, value);
    return value;
  }

  function availableHistoryHours(token) {
    return token.firstIndex == null ? 0 : LAST_INDEX - token.firstIndex + 1;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  const usd = (value) => usdFormat.format(value);
  const price = (value) => (value >= 10 ? usd(value) : `$${value.toPrecision(4)}`);
  const timeAt = (index) => DATA.startTs * 1000 + index * HOUR_MS;
  const dateAt = (index) => `${dateFormat.format(timeAt(index))} UTC`;
  const dayAt = (index) => dayFormat.format(timeAt(index));

  function percent(value, { signed = true, digits = 1 } = {}) {
    const fixed = Math.abs(value).toFixed(digits);
    if (!signed) return `${fixed}%`;
    if (Number(fixed) === 0) return `${fixed}%`;
    return `${value > 0 ? "+" : "−"}${fixed}%`;
  }

  function points(value) {
    const fixed = Math.abs(value).toFixed(1);
    return `${value >= 0 ? "+" : "−"}${fixed} pts`;
  }

  const tone = (value) => (value > 0.05 ? "gain" : value < -0.05 ? "loss" : "");
  const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
  const strategyLabel = (key) => Engine.STRATEGIES[key].label;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  /** US regular session is roughly 13:30 to 20:00 UTC on weekdays; outside it the price is DEX only. */
  function isMarketHours(index) {
    const date = new Date(timeAt(index));
    const day = date.getUTCDay();
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return day >= 1 && day <= 5 && minutes >= 13 * 60 + 30 && minutes < 20 * 60;
  }

  function minutesToNextRun() {
    const now = new Date();
    return 60 - now.getUTCMinutes();
  }

  function daysAgoLabel(index) {
    const days = Math.round((LAST_INDEX - index) / 24);
    if (days <= 0) return "today";
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }

  // ---------------------------------------------------------------------------
  // Chart (inline SVG, no library)
  // ---------------------------------------------------------------------------

  /**
   * @param {{label: string, values: number[], color: string, dashed?: boolean}[]} series
   * @param {number} fromIndex  hour index of values[0]
   */
  function chartHtml(id, rawSeries, fromIndex, { height = 220, baseline, legend = true, step = 1 } = {}) {
    // step > 1 keeps every nth hour for a calmer line on marketing charts.
    const series = rawSeries.map((line) => ({ ...line, values: line.values.filter((_, i) => i % step === 0 || i === line.values.length - 1) }));
    const width = 600;
    const pad = { top: 12, right: 8, bottom: 24, left: 8 };
    const all = series.flatMap((line) => line.values);
    if (baseline != null) all.push(baseline);
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (max - min < 1e-9) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    min -= span * 0.08;
    max += span * 0.08;
    const count = series[0].values.length;
    const x = (i) => pad.left + (count > 1 ? (i / (count - 1)) * (width - pad.left - pad.right) : 0);
    const y = (value) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);

    const paths = series
      .map((line, seriesIndex) => {
        const d = line.values.map((value, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join("");
        const area =
          seriesIndex === 0
            ? `<defs><linearGradient id="fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${line.color};stop-opacity:0.14"/><stop offset="1" style="stop-color:${line.color};stop-opacity:0"/></linearGradient></defs><path d="${d}L${x(count - 1).toFixed(1)},${height - pad.bottom}L${x(0).toFixed(1)},${height - pad.bottom}Z" fill="url(#fill-${id})"/>`
            : "";
        const draw = seriesIndex === 0 && !line.dashed ? 'class="chart__line" pathLength="1"' : "";
        return `${area}<path d="${d}" ${draw} fill="none" stroke="${line.color}" stroke-width="${seriesIndex === 0 ? 2 : 1.5}" ${line.dashed ? 'stroke-dasharray="4 4"' : ""} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
      })
      .join("");

    const baselineLine =
      baseline != null
        ? `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="var(--color-border-strong)" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>`
        : "";

    // Three date labels: start, middle, end.
    const labels = [0, Math.floor((count - 1) / 2), count - 1]
      .map((i, n) => `<text x="${x(i)}" y="${height - 6}" font-size="11" fill="var(--color-text-faint)" text-anchor="${["start", "middle", "end"][n]}" font-family="var(--font-sans)">${dayAt(fromIndex + Math.min(i * step, rawSeries[0].values.length - 1))}</text>`)
      .join("");

    const legendHtml = series
      .map((line) => `<span><span class="chart__swatch" style="background:${line.color}"></span>${escapeHtml(line.label)}</span>`)
      .join("");

    chartRegistry.set(id, { series, fromIndex, count, x, y, width, height, pad, step, last: rawSeries[0].values.length - 1 });

    return `
      <div class="chart" data-chart="${id}">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(series.map((line) => line.label).join(" versus "))} chart">
          ${baselineLine}${paths}${labels}
          <line class="chart__cursor" x1="0" x2="0" y1="${pad.top}" y2="${height - pad.bottom}" stroke="var(--color-text)" stroke-width="1" opacity="0" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="chart__tooltip"></div>
        ${legend ? `<div class="chart__legend">${legendHtml}</div>` : ""}
      </div>`;
  }

  const chartRegistry = new Map();

  function bindCharts() {
    document.querySelectorAll("[data-chart]").forEach((element) => {
      const chart = chartRegistry.get(element.dataset.chart);
      if (!chart) return;
      const svg = element.querySelector("svg");
      const cursor = element.querySelector(".chart__cursor");
      const tooltip = element.querySelector(".chart__tooltip");
      const move = (event) => {
        const box = svg.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        const i = Math.round(ratio * (chart.count - 1));
        const xView = chart.x(i);
        cursor.setAttribute("x1", xView);
        cursor.setAttribute("x2", xView);
        cursor.setAttribute("opacity", "0.25");
        tooltip.style.left = `${(xView / chart.width) * 100}%`;
        tooltip.textContent = `${dateAt(chart.fromIndex + Math.min(i * chart.step, chart.last))}  ${chart.series.map((line) => `${line.label} ${usd(line.values[i])}`).join("  ")}`;
      };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerleave", () => cursor.setAttribute("opacity", "0"));
    });
  }

  // ---------------------------------------------------------------------------
  // Shared fragments
  // ---------------------------------------------------------------------------

  function decisionHtml(decision) {
    return `
      <div class="decision">
        <span class="decision__action decision__action--${decision.action}">${decision.action}</span>
        <span><strong>${escapeHtml(decision.symbol)}</strong> <span class="muted">${escapeHtml(decision.reasoning)}</span></span>
      </div>`;
  }

  function statusPill(status) {
    return status === "active"
      ? `<span class="pill pill--running"><span class="pulse"></span>Running</span>`
      : `<span class="pill pill--paused"><i class="ph ph-pause"></i>Paused</span>`;
  }

  let toastTimer;
  function toast(message) {
    const element = document.querySelector(".toast");
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("is-visible"), 2400);
  }

  function allAgentsWithResults() {
    const list = SAMPLE_AGENTS.map((agent) => ({ agent, ...runAgent(agent) }));
    state.myAgents
      .filter((agent) => agent.status === "active" && agent.skippedHours > 0)
      .forEach((agent) => {
        const view = myAgentView(agent);
        list.push({ agent: view, ...runAgent(view) });
      });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Page: landing
  // ---------------------------------------------------------------------------

  function landingPage() {
    const all = allAgentsWithResults();
    const ranked = all.slice().sort((a, b) => b.result.returnPct - a.result.returnPct);
    const top = ranked[0];
    const lastRun = top.result.runs[top.result.runs.length - 1];
    const decisionsLogged = all.reduce((sum, row) => sum + row.result.runs.length * row.agent.symbols.length, 0);
    const bestFor = (strategy) => ranked.find((row) => row.agent.strategy === strategy);

    // Growth of $10,000: the top agent next to holding the same stocks and staying in cash.
    const growthAgent = top.result.runs.map((run) => (run.equity / top.agent.capital) * 10000);
    const growthHold = top.hold.curve.map((value) => (value / top.agent.capital) * 10000);
    const growthCash = growthAgent.map(() => 10000);

    const leaderRows = ranked
      .slice(0, 5)
      .map(
        (row, i) => `
        <tr data-href="#/agent/${row.agent.id}">
          <td class="rank">${i + 1}</td>
          <td><a href="#/agent/${row.agent.id}">${escapeHtml(row.agent.name)}</a></td>
          <td class="muted only-desktop">${strategyLabel(row.agent.strategy)}</td>
          <td class="muted">${row.agent.symbols.join(", ")}</td>
          <td class="num ${tone(row.result.returnPct)}">${percent(row.result.returnPct)}</td>
          <td class="num ${tone(row.edge)} only-desktop">${points(row.edge)}</td>
        </tr>`,
      )
      .join("");

    const strategyCard = (key, icon, label, title, text, symbols) => {
      const best = bestFor(key);
      return `
        <a class="strategy-card reveal" href="#/forge" data-strategy-link="${key}">
          <div>
            <img class="strategy-card__icon" src="img/icons/${icon}.png" alt="" width="72" height="72" />
            <div class="strategy-card__label">${label}</div>
            <h3 class="strategy-card__title">${title}</h3>
            <p class="strategy-card__text">${text}</p>
          </div>
          <div class="stack stack--tight">
            <div class="token-stack">${symbols.map((symbol) => `<span class="token-dot">${symbol}</span>`).join("")}<span class="token-dot">+${DATA.tokens.length - symbols.length}</span></div>
            <div class="strategy-card__foot">
              <span>Best agent now<strong>${best ? escapeHtml(best.agent.name) : "None yet"}</strong></span>
              <span style="text-align:right">Return<strong>${best ? percent(best.result.returnPct) : "0.0%"}</strong></span>
            </div>
          </div>
        </a>`;
    };

    return `
      <div class="hero-wrap">
        <div class="container">
          <section class="hero">
            <a class="hero__badge" href="#/leaderboard"><img src="img/icons/app.png" alt="" width="24" height="24" />Paper trading beta on Robinhood Chain<i class="ph ph-caret-right"></i></a>
            <h1 class="hero__title words">Trading agents for <span class="highlight">every stock</span></h1>
            <p class="hero__lead reveal">Build an agent for NVDA, Tesla or SPY in minutes. See how it would have traded the last 30 days before it touches a single virtual dollar.</p>
            <div class="hero__actions reveal">
              <a class="button button--primary button--large" href="#/forge">Build your agent</a>
              <a class="button button--ghost button--large" href="#/leaderboard">See live agents</a>
            </div>
          </section>
        </div>
        ${phonesHtml(top, lastRun)}
      </div>

      <div class="container">
        <section class="stats-band" aria-label="Sita in numbers">
          <div class="stat-big"><span class="stat-big__label">Stock tokens</span><span class="stat-big__value">${odometerHtml(String(DATA.tokens.length))}</span></div>
          <div class="stat-big"><span class="stat-big__label">Agents running</span><span class="stat-big__value">${odometerHtml(String(all.filter((row) => row.agent.status === "active").length))}</span></div>
          <div class="stat-big"><span class="stat-big__label">Decisions explained</span><span class="stat-big__value">${odometerHtml(decisionsLogged.toLocaleString("en-US"))}</span></div>
          <div class="stat-big"><span class="stat-big__label">Hours of real prices</span><span class="stat-big__value">${odometerHtml(DATA.hours.toLocaleString("en-US"))}</span></div>
        </section>
      </div>

      <section class="panel-dark">
        <div class="container">
          <div class="showcase">
            <span class="showcase__label reveal"><img src="img/icons/app.png" alt="" width="32" height="32" />Sita Forge</span>
            <h2 class="showcase__title words">A <span class="highlight">trading desk</span> in your browser</h2>
            <p class="showcase__lead reveal">Shape an agent, replay its last 30 days and launch it. Every number below is calculated from real Robinhood Chain prices.</p>
            <div class="hero__actions reveal">
              <a class="button button--light button--large" href="#/forge">Open the Forge</a>
              <a class="button button--dark-soft button--large" href="#/leaderboard">See live agents</a>
            </div>
            ${browserHtml(ranked)}
          </div>

          <div class="strategy-section">
            <div class="section-heading">
              <span class="label">Strategies</span>
              <h2 class="section-heading__title words">A strategy for every <span class="highlight">market mood.</span></h2>
              <p class="section-heading__lead reveal">Ride strong trends or buy the dip. Every agent is measured against the simplest move of all: buying and holding.</p>
            </div>
            <div class="strategy-grid">
              ${strategyCard("momentum", "momentum", "Trend following", "Momentum", "Buys after a rise of more than 3% in a day and sells once the trend breaks. Made for stocks on the move.", ["NVDA", "PLTR", "TSLA"])}
              ${strategyCard("mean_reversion", "mean-reversion", "Buy the dip", "Mean reversion", "Waits for unusual drops and sells the rebound once the price is back to normal. Made for choppy markets.", ["META", "SPY", "GME"])}
              <div class="strategy-card reveal">
                <div>
                  <img class="strategy-card__icon" src="img/icons/backtest.png" alt="" width="72" height="72" />
                  <div class="strategy-card__label">The benchmark</div>
                  <h3 class="strategy-card__title">Buy and hold</h3>
                  <p class="strategy-card__text">Not a strategy you pick, but the one every agent has to beat. Its line sits next to yours on every chart.</p>
                </div>
                <div class="strategy-card__foot">
                  <span>Agents beating it<strong>${all.filter((row) => row.edge > 0).length} of ${all.length}</strong></span>
                  <span style="text-align:right">Cost per trade<strong>0.5%</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="page__head">
            <div class="section-heading" style="margin-bottom:0">
              <span class="label">Markets</span>
              <h2 class="section-heading__title words">Every big name, <span class="highlight">around the clock.</span></h2>
              <p class="section-heading__lead reveal">${DATA.tokens.length} US stocks and ETFs as tokens on Robinhood Chain. They keep trading at night and on weekends, and so can your agent.</p>
            </div>
          </div>
          ${stockGridHtml()}
        </div>
      </section>

      <section class="section section--subtle">
        <div class="container">
          <div class="section-heading">
            <span class="label">How it works</span>
            <h2 class="section-heading__title words">From idea to <span class="highlight">running agent.</span></h2>
            <p class="section-heading__lead reveal">No code, no formulas, no deposit. Shape it, check it, launch it.</p>
          </div>
          <div class="grid-3">
            <article class="feature reveal" style="background:#fff">
              <img class="feature__icon" src="img/icons/backtest.png" alt="" width="64" height="64" />
              <span class="feature__step">Step 1</span>
              <h3>Replay the last 30 days</h3>
              <p>Pick a strategy, up to three stocks and a stop loss. The Forge replays real hourly prices with your exact settings, instantly.</p>
            </article>
            <article class="feature reveal" style="background:#fff">
              <img class="feature__icon" src="img/icons/agent.png" alt="" width="64" height="64" />
              <span class="feature__step">Step 2</span>
              <h3>Launch your agent</h3>
              <p>Sign one free message with your wallet. Your agent checks prices every hour and writes down why it acted.</p>
            </article>
            <article class="feature reveal" style="background:#fff">
              <img class="feature__icon" src="img/icons/leaderboard.png" alt="" width="64" height="64" />
              <span class="feature__step">Step 3</span>
              <h3>Climb the leaderboard</h3>
              <p>Every agent has a public page, ranked by return and by how far it beats holding. Share yours in one click.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container feed-section">
          <div>
            <div class="section-heading" style="margin-bottom:0">
              <span class="label">Decision log</span>
              <h2 class="section-heading__title words">Every move, <span class="highlight">explained.</span></h2>
              <p class="section-heading__lead reveal">Agents never act in silence. Each hour they write down what they saw and why they bought, sold or waited.</p>
            </div>
            <ul class="check-list reveal">
              <li><i class="ph ph-check"></i>The exact signal: 24h change, distance from the average, z score</li>
              <li><i class="ph ph-check"></i>Stop losses called out the moment they trigger</li>
              <li><i class="ph ph-check"></i>Trades outside New York hours marked as DEX hours</li>
            </ul>
          </div>
          ${feedHtml(all)}
        </div>
      </section>

      <section class="section section--subtle">
        <div class="container">
          <p class="tagline" data-tagline>Most trading ideas sound great in your head. Thirty days of real prices show which ones actually work.</p>
          <div class="proof-grid">
            <div class="proof reveal" style="background:#fff"><strong>0.5%</strong><span>Charged on every simulated trade for fees and slippage.</span></div>
            <div class="proof reveal" style="background:#fff"><strong>1 hour</strong><span>Between decisions, around the clock, weekends included.</span></div>
            <div class="proof reveal" style="background:#fff"><strong>30 days</strong><span>Of real Robinhood Chain prices replayed before launch.</span></div>
            <div class="proof reveal" style="background:#fff"><strong>100%</strong><span>Of decisions come with a plain language reason.</span></div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-heading">
            <span class="label">Track record</span>
            <h2 class="section-heading__title words">Every agent next to <span class="highlight">just holding.</span></h2>
            <p class="section-heading__lead reveal">Growth of $10,000 with ${escapeHtml(top.agent.name)}, the top agent right now, compared with holding the same stocks or staying in cash.</p>
          </div>
          <div class="growth reveal">
            <div class="growth__legend">
              <div class="growth__row"><span><span class="swatch" style="background:var(--color-purple-rich)"></span>${escapeHtml(top.agent.name)}</span><strong>${usd(growthAgent[growthAgent.length - 1])}</strong></div>
              <div class="growth__row"><span><span class="swatch" style="background:var(--color-hold-line)"></span>Holding ${top.agent.symbols.join(", ")}</span><strong>${usd(growthHold[growthHold.length - 1])}</strong></div>
              <div class="growth__row"><span><span class="swatch" style="background:var(--color-border-strong)"></span>Cash</span><strong>${usd(10000)}</strong></div>
              <a class="button button--ghost" href="#/agent/${top.agent.id}" style="width:fit-content">Open agent<i class="ph ph-arrow-right"></i></a>
            </div>
            ${chartHtml(
              "growth",
              [
                { label: top.agent.name, values: growthAgent, color: "var(--color-purple-rich)" },
                { label: "Holding", values: growthHold, color: "var(--color-hold-line)", dashed: true },
                { label: "Cash", values: growthCash, color: "var(--color-border-strong)" },
              ],
              top.agent.fromIndex,
              { height: 300, legend: false, step: 6 },
            )}
          </div>
        </div>
      </section>

      <section class="section" style="padding-top:0">
        <div class="container">
          <div class="page__head">
            <div class="section-heading" style="margin-bottom:0">
              <span class="label">Leaderboard</span>
              <h2 class="section-heading__title words">Agents running <span class="highlight">right now.</span></h2>
            </div>
            <a class="button button--ghost" href="#/leaderboard">Full leaderboard<i class="ph ph-arrow-right"></i></a>
          </div>
          <div class="card reveal" style="padding:var(--space-100) var(--space-200)">
            <div class="table-wrap">
              <table class="table table--clickable">
                <thead><tr><th>#</th><th>Agent</th><th class="only-desktop">Strategy</th><th>Stocks</th><th class="num">Return</th><th class="num only-desktop">vs holding</th></tr></thead>
                <tbody>${leaderRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="section section--subtle">
        <div class="container">
          <div class="section-heading section-heading--center">
            <span class="label">FAQ</span>
            <h2 class="section-heading__title words">Before you <span class="highlight">build.</span></h2>
          </div>
          <div class="faq reveal">
            ${[
              ["Is real money involved?", "No. During the beta every agent trades virtual dollars at real Robinhood Chain prices. Signing in costs no gas and never moves funds from your wallet."],
              ["What are stock tokens?", "Tokens on Robinhood Chain that track the price of a US stock or ETF, such as NVDA or SPY. They trade around the clock, including weekends."],
              ["How often does my agent trade?", "It checks prices at the top of every hour and only trades when its rule triggers. Many hours end in a hold, and that is normal."],
              ["Why compare with holding?", "Because it is the easiest alternative. If an agent cannot beat simply buying the same stocks and waiting, you should know before you trust it."],
              ["Can I change my agent later?", "Agents are locked once launched so their track record stays honest. Pause it and build a new one with different settings."],
              ["Who can use Sita?", "Anyone outside the United States and other restricted countries. Stock tokens are not offered to US persons."],
            ]
              .map(([question, answer]) => `<details><summary>${question}<i class="ph ph-plus"></i></summary><p>${answer}</p></details>`)
              .join("")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          ${closingHtml(top, ranked)}
        </div>
      </section>`;
  }

  /** Closing call to action: copy on the left, a fanned stack of live product cards on the right. */
  function closingHtml(top, ranked) {
    const draft = runAgent({
      id: "closing-draft",
      strategy: "mean_reversion",
      symbols: ["META", "AAPL", "GOOGL"],
      capital: 10000,
      maxPositionPct: 33,
      stopLossPct: 6,
      fromIndex: LAST_INDEX - BACKTEST_HOURS + 1,
    });
    const rank = ranked.findIndex((row) => row.agent.id === top.agent.id) + 1;
    return `
      <div class="closing reveal">
        <div class="closing__copy">
          <span class="label">Get started</span>
          <h2 class="closing__title words">Your first agent is <span class="highlight">free.</span></h2>
          <p class="section-heading__lead">Build it, replay its last 30 days and launch it in about five minutes. Log in with Google, email or a wallet. No deposit, no gas.</p>
          <div class="hero__actions" style="justify-content:flex-start">
            <button class="button button--primary button--large" type="button" data-action="go-to-app">Go to app<i class="ph ph-arrow-right"></i></button>
            <a class="button button--ghost button--large" href="#/forge">Try the Forge</a>
          </div>
          <ul class="closing__points">
            <li><i class="ph ph-check"></i>Free during beta</li>
            <li><i class="ph ph-check"></i>Virtual money only</li>
            <li><i class="ph ph-check"></i>Pause anytime</li>
          </ul>
        </div>

        <div class="closing__stack" aria-hidden="true">
          <div class="closing__card closing__card--back">
            <div class="closing__card-head"><img src="img/icons/backtest.png" alt="" width="36" height="36" /><span>Backtest</span></div>
            <div class="closing__big ${tone(draft.result.returnPct)}">${percent(draft.result.returnPct)}</div>
            <div class="muted" style="font-size:13px;line-height:18px">Mean reversion on META, AAPL, GOOGL. Holding ${percent(draft.hold.returnPct)}</div>
          </div>
          <div class="closing__card closing__card--mid">
            <div class="closing__card-head"><img src="img/icons/leaderboard.png" alt="" width="36" height="36" /><span>Leaderboard</span></div>
            <div class="closing__big">#${rank}</div>
            <div class="muted" style="font-size:13px;line-height:18px">${escapeHtml(top.agent.name)}, ${points(top.edge)} versus holding</div>
          </div>
          <div class="closing__card closing__card--front">
            <div class="closing__card-head"><img src="img/icons/agent.png" alt="" width="36" height="36" /><span>${escapeHtml(top.agent.name)}</span><span class="pill pill--running" style="margin-left:auto"><span class="pulse"></span>Running</span></div>
            <div class="closing__big ${tone(top.result.returnPct)}">${percent(top.result.returnPct)}</div>
            ${decisionHtml(top.result.runs[top.result.runs.length - 1].decisions[0])}
          </div>
        </div>
      </div>`;
  }

  /** Stable color per ticker for the monogram avatars (no stock logos: those are trademarks). */
  function avatarHtml(symbol) {
    const palette = ["#8075ff", "#252228", "#1c4886", "#0a9a4c", "#e04400", "#4c1f5e", "#2775ca", "#c18fff", "#26a17b", "#9c8cff"];
    const hash = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return `<span class="ticker-avatar" style="background:${palette[hash % palette.length]}">${symbol.slice(0, 4)}</span>`;
  }

  /** Dark browser window showing the Sita app, Aave Pro style. */
  function browserHtml(ranked) {
    const rows = ranked
      .slice(0, 7)
      .map(
        (row) => `
        <tr>
          <td><span class="agent-cell">${avatarHtml(row.agent.symbols[0])}<span>${escapeHtml(row.agent.name)}<span class="sub">${row.agent.symbols.join(", ")}</span></span></span></td>
          <td class="hide-sm">${strategyLabel(row.agent.strategy)}<span class="sub">Stop ${row.agent.stopLossPct}%</span></td>
          <td class="${tone(row.result.returnPct)}">${percent(row.result.returnPct)}<span class="sub">${usd(row.result.finalEquity)}</span></td>
          <td class="hide-sm ${tone(row.edge)}">${points(row.edge)}<span class="sub">vs holding</span></td>
          <td class="hide-sm hide-md">${row.result.trades.length}<span class="sub">${percent(-row.result.maxDrawdownPct)} worst</span></td>
        </tr>`,
      )
      .join("");

    const nav = (icon, label, on = false) => `<div class="browser__nav${on ? " browser__nav--on" : ""}"><i class="ph ph-${icon}"></i>${label}</div>`;

    return `
      <div class="browser reveal" aria-hidden="true">
        <div class="browser__bar">
          <div class="browser__dots"><span></span><span></span><span></span></div>
          <div class="browser__url">sita / leaderboard</div>
          <div></div>
        </div>
        <div class="browser__body">
          <aside class="browser__side">
            <div class="browser__brand"><img src="img/icons/app.png" alt="" />Sita</div>
            ${nav("squares-four", "Dashboard")}
            ${nav("robot", "My agent")}
            <div class="browser__group">Explore</div>
            ${nav("sliders-horizontal", "Forge")}
            ${nav("trophy", "Leaderboard", true)}
            ${nav("chart-line-up", "Markets")}
            <div class="browser__group">Learn</div>
            ${nav("book-open", "Strategies")}
            ${nav("question", "FAQ")}
          </aside>
          <div class="browser__main">
            <div class="browser__top">
              <div class="browser__search"><i class="ph ph-magnifying-glass"></i> Search agents and stocks</div>
              <div style="display:flex;gap:var(--space-75)"><span class="browser__chip"><i class="ph ph-plus"></i> New agent</span><span class="browser__chip">${shortAddress(DEMO_WALLET)}</span></div>
            </div>
            <div>
              <div class="browser__title">Leaderboard</div>
              <div style="color:rgba(246,247,244,0.5);margin-top:4px">Agents ranked by return, next to what holding would have made.</div>
            </div>
            <div style="display:flex;gap:var(--space-75);flex-wrap:wrap"><span class="browser__chip">All strategies</span><span class="browser__chip">Last 30 days</span><span class="browser__chip">Running</span></div>
            <div class="browser__table-wrap">
              <table class="browser__table">
                <thead><tr><th>Agent</th><th class="hide-sm">Strategy</th><th>Return</th><th class="hide-sm">vs holding</th><th class="hide-sm hide-md">Trades</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
  }

  /** All stock tokens with price, 24h change and a 7 day sparkline. */
  function stockGridHtml() {
    return `<div class="stock-grid">${DATA.tokens
      .filter((token) => token.closes[LAST_INDEX] != null)
      .map((token) => {
        const now = token.closes[LAST_INDEX];
        const dayAgo = token.closes[Math.max(token.firstIndex, LAST_INDEX - 24)];
        const change = (now / dayAgo - 1) * 100;
        const week = token.closes.slice(Math.max(token.firstIndex, LAST_INDEX - 7 * 24)).filter((value, i) => value != null && i % 3 === 0);
        const min = Math.min(...week);
        const max = Math.max(...week);
        const points = week.map((value, i) => `${((i / Math.max(1, week.length - 1)) * 100).toFixed(1)},${(38 - ((value - min) / (max - min || 1)) * 34).toFixed(1)}`).join(" ");
        const color = week[week.length - 1] >= week[0] ? "var(--color-gain)" : "var(--color-loss)";
        return `
          <a class="stock-tile reveal" href="#/forge" data-symbol-link="${token.symbol}" title="Build an agent for ${escapeHtml(token.name)}">
            <span class="stock-tile__head">${avatarHtml(token.symbol)}<span><strong>${token.symbol}</strong><span class="stock-tile__name">${escapeHtml(token.name)}</span></span></span>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
            <span class="stock-tile__price">${price(now)}<small class="${tone(change)}">${percent(change)}</small></span>
          </a>`;
      })
      .join("")}</div>`;
  }

  /** Real buy and sell decisions from every sample agent, newest first, looping. */
  function feedHtml(all) {
    const items = all
      .flatMap((row) =>
        row.result.runs.flatMap((run) =>
          run.decisions.filter((decision) => decision.action !== "hold").map((decision) => ({ ...decision, index: run.index, agent: row.agent.name })),
        ),
      )
      .sort((a, b) => b.index - a.index)
      .slice(0, 14);
    const list = items
      .map(
        (item) => `
        <div class="feed__item">
          <div class="feed__meta"><span>${escapeHtml(item.agent)}</span><span>${dateAt(item.index)}</span></div>
          <div style="display:flex;gap:var(--space-100)"><span class="decision__action decision__action--${item.action}">${item.action}</span><span><strong>${item.symbol}</strong> <span class="muted">${escapeHtml(item.reasoning)}</span></span></div>
        </div>`,
      )
      .join("");
    // The list is rendered twice so the upward loop has no visible seam.
    return `<div class="feed reveal" aria-label="Recent agent decisions"><div class="feed__track">${list}${list}</div></div>`;
  }

  /** Three phone screens built in HTML, fed by the same live sample data. */
  function phonesHtml(top, lastRun) {
    const status = `<div class="phone__island"></div><div class="phone__status"><span>9:41</span><span><i class="ph-fill ph-cell-signal-full"></i> <i class="ph-fill ph-battery-full"></i></span></div>`;
    const equity = top.result.runs.map((run) => run.equity);
    const min = Math.min(...equity);
    const max = Math.max(...equity);
    const sparkline = equity
      .filter((_, i) => i % 4 === 0)
      .map((value, i, list) => `${((i / (list.length - 1)) * 100).toFixed(1)},${(36 - ((value - min) / (max - min || 1)) * 32).toFixed(1)}`)
      .join(" ");

    const forgeDraft = runAgent({
      id: "phone-forge",
      strategy: "mean_reversion",
      symbols: ["META", "AAPL", "GOOGL"],
      capital: 10000,
      maxPositionPct: 33,
      stopLossPct: 6,
      fromIndex: LAST_INDEX - BACKTEST_HOURS + 1,
    });

    const logItems = top.result.runs
      .slice()
      .reverse()
      .flatMap((run) => run.decisions.filter((decision) => decision.action !== "hold").map((decision) => ({ ...decision, index: run.index })))
      .slice(0, 4);

    return `
      <div class="phones" data-phones aria-hidden="true">
        <div class="phone phone--left"><div class="phone__screen">${status}
          <div class="phone__title">Forge</div>
          <div class="phone__chips"><span class="phone__chip">Momentum</span><span class="phone__chip phone__chip--on">Mean reversion</span></div>
          <div class="phone__chips"><span class="phone__chip phone__chip--on">META</span><span class="phone__chip phone__chip--on">AAPL</span><span class="phone__chip phone__chip--on">GOOGL</span><span class="phone__chip">NVDA</span></div>
          <div class="phone__tile phone__tile--accent">
            <div class="muted">Last 30 days</div>
            <div class="phone__big ${tone(forgeDraft.result.returnPct)}" style="text-align:left;font-size:calc(var(--phone-w) * 0.11)">${percent(forgeDraft.result.returnPct)}</div>
            <div class="muted">Holding ${percent(forgeDraft.hold.returnPct)}</div>
          </div>
          <div class="phone__row muted"><span>Stop loss</span><strong style="color:var(--color-text)">6%</strong></div>
          <div class="phone__row muted"><span>Max per stock</span><strong style="color:var(--color-text)">33%</strong></div>
          <div class="phone__button">Launch agent</div>
        </div></div>

        <div class="phone phone--center"><div class="phone__screen">${status}
          <div class="phone__row"><span class="phone__title">${escapeHtml(top.agent.name)}</span><span class="pill pill--running"><span class="pulse"></span>Running</span></div>
          <img class="phone__icon" src="img/icons/agent.png" alt="" />
          <div class="phone__caption">Return since launch</div>
          <div class="phone__big ${tone(top.result.returnPct)}">${percent(top.result.returnPct)}</div>
          <div class="phone__caption">${points(top.edge)} versus holding</div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:calc(var(--phone-w) * 0.2)"><polyline points="${sparkline}" fill="none" stroke="var(--color-purple-rich)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
          <div class="phone__tile">
            <div class="muted" style="margin-bottom:calc(var(--phone-w) * 0.015)">Latest decision</div>
            <div><strong>${lastRun.decisions[0].symbol}</strong> <span class="muted">${escapeHtml(lastRun.decisions[0].reasoning)}</span></div>
          </div>
        </div></div>

        <div class="phone phone--right"><div class="phone__screen">${status}
          <div class="phone__title">Decision log</div>
          ${logItems
            .map(
              (item) => `
            <div class="phone__tile">
              <div class="phone__row" style="margin-bottom:calc(var(--phone-w) * 0.01)"><span class="decision__action decision__action--${item.action}" style="font-size:calc(var(--phone-w) * 0.032)">${item.action}</span><span class="muted">${dayAt(item.index)}</span></div>
              <div><strong>${item.symbol}</strong> <span class="muted">${escapeHtml(item.reasoning)}</span></div>
            </div>`,
            )
            .join("")}
        </div></div>
      </div>`;
  }

  /** Digits roll into place like an odometer once visible. */
  function odometerHtml(text) {
    return `<span class="odometer" data-odometer aria-label="${text}">${[...text]
      .map((char) =>
        /\d/.test(char)
          ? `<span class="odometer__digit" data-digit="${char}" aria-hidden="true">${"0123456789"
              .split("")
              .map((digit) => `<span>${digit}</span>`)
              .join("")}</span>`
          : `<span aria-hidden="true">${char}</span>`,
      )
      .join("")}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Page: Forge
  // ---------------------------------------------------------------------------

  const forge = {
    name: "",
    strategy: "momentum",
    symbols: ["NVDA"],
    capital: 10000,
    maxPositionPct: 33,
    stopLossPct: 8,
    showError: false,
  };

  function forgePage() {
    const tokens = DATA.tokens
      .map((token) => {
        const hours = availableHistoryHours(token);
        const tooNew = hours < BACKTEST_HOURS + Engine.WARMUP_HOURS;
        const selected = forge.symbols.includes(token.symbol);
        const full = forge.symbols.length >= 3 && !selected;
        const change = (token.closes[LAST_INDEX] / token.closes[Math.max(token.firstIndex, LAST_INDEX - 24)] - 1) * 100;
        const title = tooNew ? `Listed ${Math.max(1, Math.round(hours / 24))} days ago. Needs 32 days of history.` : full ? "You can pick up to 3 stocks" : token.name;
        return `
          <button class="token" type="button" data-symbol="${token.symbol}" aria-pressed="${selected}" ${tooNew || full ? "disabled" : ""} title="${escapeHtml(title)}">
            <span class="token__row"><span class="token__symbol">${token.symbol}</span><span class="mono ${tooNew ? "" : tone(change)}">${tooNew ? "New" : percent(change)}</span></span>
            <span class="token__name">${tooNew ? "Too new to backtest" : escapeHtml(token.name)}</span>
          </button>`;
      })
      .join("");

    return `
      <div class="container page">
        <div class="page__head">
          <div>
            <h1 class="page__title">Forge</h1>
            <p class="page__lead">Shape your agent and watch the last 30 days replay with your exact settings.</p>
          </div>
        </div>

        <div class="forge">
          <form class="card" id="forge-form" novalidate>
            <div class="form-section">
              <label class="form-section__label" for="agent-name">Name <span class="form-section__hint">Shown on the leaderboard</span></label>
              <input class="input" id="agent-name" name="name" maxlength="40" placeholder="Night Owl NVDA" value="${escapeHtml(forge.name)}" autocomplete="off" aria-describedby="name-error" ${forge.showError && !forge.name.trim() ? 'aria-invalid="true"' : ""} />
              <span class="field-error" id="name-error" ${forge.showError && !forge.name.trim() ? "" : "hidden"}>Give your agent a name first.</span>
            </div>

            <div class="form-section" role="radiogroup" aria-labelledby="strategy-label">
              <div class="form-section__label" id="strategy-label">Strategy</div>
              <div class="choice-grid">
                <label class="choice">
                  <input type="radio" name="strategy" value="momentum" ${forge.strategy === "momentum" ? "checked" : ""} />
                  <img class="choice__icon" src="img/icons/momentum.png" alt="" width="44" height="44" />
                  <span class="choice__title">Momentum</span>
                  <span class="choice__text">Rides strong moves. Buys after a rise of more than 3% in a day, sells when the trend breaks.</span>
                </label>
                <label class="choice">
                  <input type="radio" name="strategy" value="mean_reversion" ${forge.strategy === "mean_reversion" ? "checked" : ""} />
                  <img class="choice__icon" src="img/icons/mean-reversion.png" alt="" width="44" height="44" />
                  <span class="choice__title">Mean reversion</span>
                  <span class="choice__text">Buys unusual dips and sells the rebound once the price is back to normal.</span>
                </label>
              </div>
            </div>

            <div class="form-section">
              <div class="form-section__label">Stocks <span class="form-section__hint"><span id="symbol-count">${forge.symbols.length}</span> of 3 picked</span></div>
              <div class="token-grid" id="token-grid">${tokens}</div>
              <span class="field-error" id="symbols-error" ${forge.showError && !forge.symbols.length ? "" : "hidden"}>Pick at least one stock.</span>
            </div>

            <div class="form-section">
              <label class="form-section__label" for="capital">Virtual capital <span class="form-section__hint">Play money, in USD</span></label>
              <input class="input mono" id="capital" name="capital" type="number" min="1000" max="1000000" step="1000" value="${forge.capital}" />
            </div>

            <div class="form-section">
              <label class="form-section__label" for="max-position">Max per stock <span class="form-section__hint">Share of the agent's money in one stock</span></label>
              <div class="range"><input id="max-position" name="maxPositionPct" type="range" min="10" max="100" step="1" value="${forge.maxPositionPct}" /><output class="mono" for="max-position">${forge.maxPositionPct}%</output></div>
            </div>

            <div class="form-section">
              <label class="form-section__label" for="stop-loss">Stop loss <span class="form-section__hint">Sell when a position falls this far</span></label>
              <div class="range"><input id="stop-loss" name="stopLossPct" type="range" min="2" max="25" step="1" value="${forge.stopLossPct}" /><output class="mono" for="stop-loss">${forge.stopLossPct}%</output></div>
              <p class="note"><i class="ph ph-info"></i>Checked once an hour, so a fast drop can go past it.</p>
            </div>
          </form>

          <aside class="forge__result" aria-live="polite" id="forge-result"></aside>
        </div>
      </div>`;
  }

  function forgeResultHtml() {
    if (!forge.symbols.length) {
      return `
        <div class="card"><div class="empty">
          <img src="img/icons/backtest.png" alt="" width="72" height="72" />
          <h2 class="card__title">Pick a stock to see the backtest</h2>
          <p>Choose up to three stocks on the left and the last 30 days replay here instantly.</p>
        </div></div>`;
    }
    const draft = { id: "draft", ...forge, fromIndex: LAST_INDEX - BACKTEST_HOURS + 1 };
    const { result, hold, edge } = runAgent(draft);
    const tradesPerWeek = (result.trades.length / 30) * 7;

    let verdict;
    if (result.returnPct > 0 && edge >= 0) {
      verdict = { icon: "ph-fill ph-check-circle gain", text: `Beat simply holding these stocks by ${Math.abs(edge).toFixed(1)} points over 30 days.` };
    } else if (result.returnPct > 0) {
      verdict = { icon: "ph-fill ph-minus-circle", text: `Made money, but holding the same stocks did ${Math.abs(edge).toFixed(1)} points better.` };
    } else if (edge >= 0) {
      verdict = { icon: "ph-fill ph-shield-check", text: `Lost ${percent(result.returnPct, { signed: false })}, but lost less than holding, which returned ${percent(hold.returnPct)}.` };
    } else {
      verdict = { icon: "ph-fill ph-warning-circle loss", text: `Lost ${percent(result.returnPct, { signed: false })} while holding returned ${percent(hold.returnPct)}. Try another strategy or other stocks.` };
    }

    return `
      <div class="card result-card">
        <div class="result-head">
          <div>
            <div class="eyebrow">Last 30 days, ${dayAt(draft.fromIndex)} to ${dayAt(LAST_INDEX)}</div>
            <div class="big-number mono ${tone(result.returnPct)}">${percent(result.returnPct)}</div>
          </div>
          <div class="result-head__aside">
            <div class="eyebrow">Holding instead</div>
            <div class="mono" style="font-size:20px;line-height:28px;font-weight:600">${percent(hold.returnPct)}</div>
          </div>
        </div>

        ${chartHtml(
          "forge",
          [
            { label: "Your agent", values: result.runs.map((run) => run.equity), color: "var(--color-purple-rich)" },
            { label: "Holding", values: hold.curve, color: "var(--color-hold-line)", dashed: true },
          ],
          draft.fromIndex,
          { height: 200, baseline: forge.capital },
        )}

        <div class="verdict"><i class="ph ${verdict.icon}"></i><span>${verdict.text}</span></div>

        <div class="stat-grid">
          <div class="stat"><span class="stat__label">Ending value</span><span class="stat__value mono">${usd(result.finalEquity)}</span></div>
          <div class="stat"><span class="stat__label">Worst drop</span><span class="stat__value mono">${percent(-result.maxDrawdownPct)}</span></div>
          <div class="stat"><span class="stat__label">Trades</span><span class="stat__value mono">${result.trades.length}</span></div>
          <div class="stat"><span class="stat__label">Winning sells</span><span class="stat__value mono">${result.winRatePct == null ? "None yet" : percent(result.winRatePct, { signed: false, digits: 0 })}</span></div>
        </div>

        ${tradesPerWeek > 14 ? `<p class="note"><i class="ph ph-warning"></i>About ${Math.round(tradesPerWeek)} trades a week. Each one costs 0.5%, which adds up fast.</p>` : ""}

        <button class="button button--primary button--large" type="button" data-action="launch">Launch agent<i class="ph ph-rocket-launch"></i></button>
        <p class="note"><i class="ph ph-info"></i>Real hourly prices with 0.5% cost per trade. Past results do not predict future ones.</p>
      </div>`;
  }

  function bindForge() {
    const form = document.getElementById("forge-form");
    const result = document.getElementById("forge-result");
    // Debounced so dragging a slider recalculates at most every 60ms.
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        result.innerHTML = forgeResultHtml();
        bindCharts();
      }, 60);
    };

    form.addEventListener("input", (event) => {
      const target = event.target;
      if (target.name === "name") {
        forge.name = target.value;
        if (forge.name.trim()) {
          target.removeAttribute("aria-invalid");
          document.getElementById("name-error").hidden = true;
        }
        return;
      }
      if (target.name === "strategy") forge.strategy = target.value;
      if (target.name === "capital") {
        const value = Number(target.value);
        if (!Number.isFinite(value) || value < 1000) return;
        forge.capital = Math.min(value, 1000000);
      }
      if (target.name === "maxPositionPct" || target.name === "stopLossPct") {
        forge[target.name] = Number(target.value);
        target.nextElementSibling.textContent = `${target.value}%`;
      }
      refresh();
    });

    form.addEventListener("submit", (event) => event.preventDefault());

    document.getElementById("token-grid").addEventListener("click", (event) => {
      const button = event.target.closest(".token");
      if (!button || button.disabled) return;
      const symbol = button.dataset.symbol;
      forge.symbols = forge.symbols.includes(symbol) ? forge.symbols.filter((s) => s !== symbol) : [...forge.symbols, symbol];
      // Re-render the grid so the 3 stock limit disables the rest.
      const scroll = window.scrollY;
      render();
      window.scrollTo(0, scroll);
      document.querySelector(`.token[data-symbol="${symbol}"]`)?.focus();
    });

    refresh();
  }

  // ---------------------------------------------------------------------------
  // Launch modal (sign in + terms)
  // ---------------------------------------------------------------------------

  function openLaunchModal() {
    if (!forge.name.trim() || !forge.symbols.length) {
      forge.showError = true;
      const scroll = window.scrollY;
      render();
      window.scrollTo(0, scroll);
      document.getElementById(forge.name.trim() ? "token-grid" : "agent-name")?.focus();
      return;
    }
    if (!currentUser()) {
      openLogin(openLaunchModal);
      return;
    }
    const atLimit = activeAgentCount() >= MAX_ACTIVE_AGENTS;
    const modal = document.getElementById("launch-modal");
    modal.innerHTML = `
      <form class="modal__body" method="dialog" id="launch-form" novalidate>
        <img class="modal__icon" src="img/icons/app.png" alt="" width="56" height="56" />
        <h2 class="modal__title" id="launch-title">Launch ${escapeHtml(forge.name.trim())}</h2>
        <p class="muted">${currentUser().walletKind === "embedded" ? "Your Sita wallet signs the launch for you. It is free and moves no funds." : "Your wallet will ask you to sign a message. It is free, uses no gas and moves no funds."}</p>
        ${atLimit ? `<div class="verdict"><i class="ph ph-warning-circle loss"></i><span>You already run ${MAX_ACTIVE_AGENTS} agents, the most at once. Pause one in your dashboard to launch another.</span></div>` : `<div class="verdict"><i class="ph ph-robot"></i><span>This will be agent ${activeAgentCount() + 1} of ${MAX_ACTIVE_AGENTS} running. Each starts with its own virtual capital.</span></div>`}
        <label class="check"><input type="checkbox" name="terms" required /><span>I accept the <a href="#/terms" target="_blank">terms</a> and understand this is paper trading with virtual money.</span></label>
        <label class="check"><input type="checkbox" name="residence" required /><span>I am not a US person and not resident in a restricted country.</span></label>
        <span class="field-error" id="launch-error" hidden>Please tick both boxes to continue.</span>
        <div class="modal__actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Cancel</button>
          <button class="button button--primary" type="submit" ${atLimit ? "disabled" : ""}>${currentUser().walletKind === "embedded" ? "Launch agent" : "Sign and launch"}</button>
        </div>
      </form>`;
    modal.showModal();

    modal.querySelector("#launch-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.target;
      if (!form.terms.checked || !form.residence.checked) {
        modal.querySelector("#launch-error").hidden = false;
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = currentUser().walletKind === "embedded" ? "Launching…" : "Waiting for signature…";
      // Prototype: pretend the wallet signed after a short pause.
      setTimeout(() => {
        const id = `mine-${Date.now()}`;
        state.myAgents.push({
          id,
          name: forge.name.trim(),
          strategy: forge.strategy,
          symbols: [...forge.symbols],
          capital: forge.capital,
          maxPositionPct: forge.maxPositionPct,
          stopLossPct: forge.stopLossPct,
          status: "active",
          skippedHours: 0,
          createdAt: Date.now(),
        });
        saveState();
        modal.close();
        location.hash = `#/agent/${id}`;
        toast("Agent launched. First decision at the top of the hour.");
      }, 900);
    });
  }

  // ---------------------------------------------------------------------------
  // Page: agent
  // ---------------------------------------------------------------------------

  const agentView = { range: "all", showHolds: false };
  let openAgentId = null; // the visitor's own agent currently on screen

  function openOwnAgent() {
    return state.myAgents.find((agent) => agent.id === openAgentId) || myCurrentAgent();
  }

  function agentPage(id) {
    let agent;
    const own = id === "mine" ? myCurrentAgent() : state.myAgents.find((candidate) => candidate.id === id);
    if (id === "mine" && !own) return noAgentPage();
    if (own) {
      agent = myAgentView(own);
      openAgentId = own.id;
    } else {
      agent = SAMPLE_AGENTS.find((candidate) => candidate.id === id);
      if (!agent) return notFoundPage();
    }

    const settingsCard = `
      <div class="card">
        <h2 class="card__title" style="margin-bottom:var(--space-200)">Settings</h2>
        <div class="stack stack--tight" style="font-size:14px;line-height:20px">
          ${[
            ["Strategy", strategyLabel(agent.strategy)],
            ["Stocks", agent.symbols.join(", ")],
            ["Starting capital", usd(agent.capital)],
            ["Max per stock", `${agent.maxPositionPct}%`],
            ["Stop loss", `${agent.stopLossPct}%`],
            ["Owner", `<span class="mono">${shortAddress(agent.owner)}</span>`],
          ]
            .map(([label, value]) => `<div style="display:flex;justify-content:space-between;gap:var(--space-200)"><span class="muted">${label}</span><span>${value}</span></div>`)
            .join("")}
        </div>
      </div>`;

    const simulateBar = agent.isMine
      ? `
      <div class="proto-bar">
        <span class="eyebrow"><i class="ph ph-flask"></i>Prototype: preview your agent as if it launched</span>
        <div class="tabs" role="tablist" aria-label="Simulated time since launch">
          ${[
            [0, "Just now"],
            [7 * 24, "7 days ago"],
            [30 * 24, "30 days ago"],
          ]
            .map(([hours, label]) => `<button class="tab" role="tab" type="button" data-skip="${hours}" aria-selected="${agent.skippedHours === hours}">${label}</button>`)
            .join("")}
        </div>
      </div>`
      : "";

    const header = (extra = "") => `
      ${simulateBar}
      <div class="agent-head">
        <div>
          <a class="eyebrow" href="#/leaderboard" style="text-decoration:none"><i class="ph ph-arrow-left"></i>Leaderboard</a>
          <h1 class="page__title" style="margin-top:var(--space-100)">${escapeHtml(agent.name)}</h1>
          <div class="agent-head__meta">
            ${statusPill(agent.status)}
            <span>${strategyLabel(agent.strategy)}</span><span aria-hidden="true">·</span>
            <span>${agent.symbols.join(", ")}</span><span aria-hidden="true">·</span>
            <span>${agent.status === "active" ? `Next decision in ${minutesToNextRun()} min` : "Not trading while paused"}</span>
          </div>
        </div>
        <div class="hero__actions">
          ${agent.isMine ? `<button class="button button--ghost" type="button" data-action="toggle-pause"><i class="ph ${agent.status === "active" ? "ph-pause" : "ph-play"}"></i>${agent.status === "active" ? "Pause" : "Resume"}</button>` : ""}
          <button class="button button--ghost" type="button" data-action="share"><i class="ph ph-share-network"></i>Share</button>
          ${extra}
        </div>
      </div>`;

    // The visitor's agent was launched "now", so it has no history yet.
    if (agent.isMine && agent.skippedHours === 0) {
      const preview = runAgent({ ...agent, id: "mine-preview", fromIndex: LAST_INDEX - BACKTEST_HOURS + 1 });
      return `
        <div class="container page">
          ${header()}
          <div class="agent-layout">
            <div class="stack">
              <div class="card">
                <div class="stat-grid">
                  <div class="stat"><span class="stat__label">Value</span><span class="stat__value mono">${usd(agent.capital)}</span></div>
                  <div class="stat"><span class="stat__label">Return</span><span class="stat__value mono">0.0%</span></div>
                  <div class="stat"><span class="stat__label">Cash</span><span class="stat__value mono">${usd(agent.capital)}</span></div>
                  <div class="stat"><span class="stat__label">Trades</span><span class="stat__value mono">0</span></div>
                </div>
              </div>
              <div class="card"><div class="empty">
                <img src="img/icons/backtest.png" alt="" width="72" height="72" />
                <h2 class="card__title">Waiting for the first decision</h2>
                <p>Your agent checks prices at the top of every hour, in about ${minutesToNextRun()} minutes. Trades and reasoning show up here.</p>
              </div></div>
            </div>
            <div class="stack">
              <div class="card stack">
                <div>
                  <div class="eyebrow">While you wait</div>
                  <h2 class="card__title">This setup over the last 30 days</h2>
                </div>
                ${chartHtml("preview", [{ label: "Backtest", values: preview.result.runs.map((run) => run.equity), color: "var(--color-text-muted)" }], LAST_INDEX - BACKTEST_HOURS + 1, { height: 140, baseline: agent.capital })}
                <div class="mono ${tone(preview.result.returnPct)}" style="font-size:24px;line-height:32px;font-weight:600">${percent(preview.result.returnPct)} <span class="muted" style="font-size:14px;line-height:20px;font-weight:400">vs holding ${percent(preview.hold.returnPct)}</span></div>
              </div>
              ${settingsCard}
            </div>
          </div>
        </div>`;
    }

    const { result, hold, edge } = runAgent(agent);
    const lastRun = result.runs[result.runs.length - 1];
    const rangeHours = { "7d": 7 * 24, "30d": 30 * 24, all: Infinity }[agentView.range];
    const startOffset = Math.max(0, result.runs.length - rangeHours);
    const visibleRuns = result.runs.slice(startOffset);
    const holdCurve = hold.curve.slice(startOffset);

    const positionRows = Object.entries(result.positions)
      .map(([symbol, position]) => {
        const now = tokensBySymbol[symbol].closes[LAST_INDEX];
        const change = (now / position.entryPrice - 1) * 100;
        return `<tr><td><strong>${symbol}</strong></td><td class="num mono">${price(position.entryPrice)}</td><td class="num mono">${price(now)}</td><td class="num mono ${tone(change)}">${percent(change)}</td><td class="num mono">${usd(position.quantity * now)}</td></tr>`;
      })
      .join("");

    const hasTrades = result.trades.length > 0;
    const showHolds = agentView.showHolds || !hasTrades;
    const logRuns = result.runs
      .slice()
      .reverse()
      .filter((run) => showHolds || run.decisions.some((decision) => decision.action !== "hold"))
      .slice(0, showHolds ? (hasTrades ? 24 : 6) : 12);

    // Biggest 24h move per stock since launch, to explain why a quiet agent has not traded.
    const biggestMove = agent.symbols
      .map((symbol) => {
        const closes = tokensBySymbol[symbol].closes;
        let best = -Infinity;
        for (let index = Math.max(agent.fromIndex, 24); index <= LAST_INDEX; index++) best = Math.max(best, closes[index] / closes[index - 24] - 1);
        return { symbol, move: best * 100 };
      })
      .sort((a, b) => b.move - a.move)[0];
    const quietReason =
      agent.strategy === "momentum"
        ? `Momentum buys after a rise of more than 3% in a day. The biggest 24h rise since launch was ${percent(biggestMove.move)} on ${biggestMove.symbol}.`
        : "Mean reversion buys only after an unusually sharp drop. None of its stocks has dropped that far since launch.";

    const tradeRows = result.trades
      .slice()
      .reverse()
      .slice(0, 20)
      .map(
        (trade) => `
        <tr>
          <td class="muted">${dateAt(trade.index)}</td>
          <td><span class="decision__action decision__action--${trade.side}">${trade.side}</span></td>
          <td><strong>${trade.symbol}</strong></td>
          <td class="num mono">${price(trade.price)}</td>
          <td class="num mono">${usd(trade.quantity * trade.price)}</td>
          <td>${trade.reason === "stop_loss" ? '<span class="pill pill--warn">Stop loss</span>' : ""} ${isMarketHours(trade.index) ? "" : '<span class="pill" title="New York exchange closed. Price came from Robinhood Chain trading only.">DEX hours</span>'}</td>
        </tr>`,
      )
      .join("");

    return `
      <div class="container page">
        ${header()}
        <div class="agent-layout">
          <div class="stack">
            <div class="card stack">
              <div class="stat-grid">
                <div class="stat"><span class="stat__label">Value</span><span class="stat__value mono">${usd(result.finalEquity)}</span></div>
                <div class="stat"><span class="stat__label">Return since ${dayAt(agent.fromIndex)}</span><span class="stat__value mono ${tone(result.returnPct)}">${percent(result.returnPct)}</span></div>
                <div class="stat"><span class="stat__label">vs holding</span><span class="stat__value mono ${tone(edge)}">${points(edge)}</span></div>
                <div class="stat"><span class="stat__label">Worst drop</span><span class="stat__value mono">${percent(-result.maxDrawdownPct)}</span></div>
              </div>
              <div class="card-head" style="margin:0">
                <h2 class="card__title">Value over time</h2>
                <div class="tabs" role="tablist" aria-label="Chart range">
                  ${["7d", "30d", "all"].map((range) => `<button class="tab" role="tab" type="button" data-range="${range}" aria-selected="${agentView.range === range}">${range === "all" ? "All" : range.toUpperCase()}</button>`).join("")}
                </div>
              </div>
              ${chartHtml(
                "agent",
                [
                  { label: "Agent", values: visibleRuns.map((run) => run.equity), color: "var(--color-purple-rich)" },
                  { label: "Holding", values: holdCurve, color: "var(--color-hold-line)", dashed: true },
                ],
                agent.fromIndex + startOffset,
                { height: 240, baseline: agent.capital },
              )}
            </div>

            <div class="card">
              <div class="card-head">
                <h2 class="card__title">Decision log</h2>
                ${hasTrades ? `<label class="check"><input type="checkbox" data-action="toggle-holds" ${agentView.showHolds ? "checked" : ""} />Show hours with no trade</label>` : '<span class="pill">Latest 6 hours</span>'}
              </div>
              ${
                logRuns.length
                  ? logRuns
                      .map(
                        (run) => `
                  <div class="log-run">
                    <span class="log-run__time">${dateAt(run.index)}${isMarketHours(run.index) ? "" : " · DEX hours"}</span>
                    ${run.decisions.map((decision) => decisionHtml(decision)).join("")}
                  </div>`,
                      )
                      .join("")
                  : ""
              }
            </div>

            <div class="card">
              <div class="card-head"><h2 class="card__title">Trades</h2><span class="muted" style="font-size:14px;line-height:20px">${result.trades.length} total, 0.5% cost each</span></div>
              ${
                tradeRows
                  ? `<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Side</th><th>Stock</th><th class="num">Price</th><th class="num">Size</th><th></th></tr></thead><tbody>${tradeRows}</tbody></table></div>`
                  : `<div class="empty">
                      <img src="img/icons/${agent.strategy === "momentum" ? "momentum" : "mean-reversion"}.png" alt="" width="72" height="72" />
                      <h3 class="card__title">Waiting for its moment</h3>
                      <p>${quietReason}</p>
                    </div>`
              }
            </div>
          </div>

          <div class="stack">
            <div class="card stack stack--tight">
              <h2 class="card__title">Latest decision</h2>
              <span class="muted" style="font-size:12px;line-height:16px">${dateAt(lastRun.index)}</span>
              ${lastRun.decisions.map(decisionHtml).join("")}
            </div>
            <div class="card">
              <div class="card-head"><h2 class="card__title">Holdings</h2><span class="mono muted" style="font-size:14px;line-height:20px">Cash ${usd(result.cash)}</span></div>
              ${
                positionRows
                  ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th class="num">Entry</th><th class="num">Now</th><th class="num">P&amp;L</th><th class="num">Value</th></tr></thead><tbody>${positionRows}</tbody></table></div>`
                  : `<div class="cash-state">
                      <div class="cash-state__bar"><span style="width:100%"></span></div>
                      <div class="growth__row" style="border:0;padding:0"><span class="muted">Cash</span><strong>100%</strong></div>
                      <p class="muted" style="font-size:13px;line-height:18px">Fully in cash. It buys the moment its rule triggers.</p>
                    </div>`
              }
            </div>
            ${settingsCard}
          </div>
        </div>
      </div>`;
  }

  function noAgentPage() {
    return `
      <div class="container page">
        <div class="card"><div class="empty" style="padding:var(--space-800) var(--space-300)">
          <img src="img/icons/agent.png" alt="" width="72" height="72" />
          <h1 class="page__title">You have no agent yet</h1>
          <p>Build one in the Forge. You will see how it would have done over the last 30 days before you launch it.</p>
          <a class="button button--primary" href="#/forge">Open the Forge</a>
        </div></div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Page: leaderboard
  // ---------------------------------------------------------------------------

  const board = { sort: "return", strategy: "all" };

  function leaderboardPage() {
    let rows = allAgentsWithResults().filter((row) => board.strategy === "all" || row.agent.strategy === board.strategy);
    const sorters = {
      return: (a, b) => b.result.returnPct - a.result.returnPct,
      edge: (a, b) => b.edge - a.edge,
      drawdown: (a, b) => a.result.maxDrawdownPct - b.result.maxDrawdownPct,
    };
    rows = rows.sort(sorters[board.sort]);

    const tableRows = rows
      .map(
        (row, i) => `
        <tr data-href="#/agent/${row.agent.id}">
          <td class="rank mono">${i + 1}</td>
          <td><a href="#/agent/${row.agent.id}">${escapeHtml(row.agent.name)}</a>${row.agent.isMine ? ' <span class="pill">You</span>' : ""}<div class="muted mono" style="font-size:12px;line-height:16px">${shortAddress(row.agent.owner)}</div></td>
          <td>${strategyLabel(row.agent.strategy)}</td>
          <td class="muted">${row.agent.symbols.join(", ")}</td>
          <td class="num mono ${tone(row.result.returnPct)}">${percent(row.result.returnPct)}</td>
          <td class="num mono ${tone(row.edge)}">${points(row.edge)}</td>
          <td class="num mono">${percent(-row.result.maxDrawdownPct)}</td>
          <td class="num mono">${row.result.trades.length}</td>
          <td class="muted">${daysAgoLabel(row.agent.fromIndex)}</td>
        </tr>`,
      )
      .join("");

    const cards = rows
      .map(
        (row, i) => `
        <a class="leader-card" href="#/agent/${row.agent.id}">
          <span class="rank mono">${i + 1}</span>
          <span><strong>${escapeHtml(row.agent.name)}</strong><div class="muted" style="font-size:12px;line-height:16px">${strategyLabel(row.agent.strategy)} · ${row.agent.symbols.join(", ")}</div></span>
          <span style="text-align:right"><span class="mono ${tone(row.result.returnPct)}" style="font-weight:600">${percent(row.result.returnPct)}</span><div class="mono muted" style="font-size:12px;line-height:16px">${points(row.edge)}</div></span>
        </a>`,
      )
      .join("");

    return `
      <div class="container page">
        <div class="page__head">
          <div>
            <h1 class="page__title">Leaderboard</h1>
            <p class="page__lead">Every public agent, with its return next to what holding the same stocks would have made.</p>
          </div>
          <a class="button button--primary" href="#/forge">Build your agent</a>
        </div>

        <div class="filter-row">
          <div class="tabs" role="tablist" aria-label="Sort by">
            ${[
              ["return", "Highest return"],
              ["edge", "Beat holding most"],
              ["drawdown", "Smallest drop"],
            ]
              .map(([key, label]) => `<button class="tab" role="tab" type="button" data-sort="${key}" aria-selected="${board.sort === key}">${label}</button>`)
              .join("")}
          </div>
          <div class="tabs" role="tablist" aria-label="Strategy">
            ${[
              ["all", "All"],
              ["momentum", "Momentum"],
              ["mean_reversion", "Mean reversion"],
            ]
              .map(([key, label]) => `<button class="tab" role="tab" type="button" data-strategy="${key}" aria-selected="${board.strategy === key}">${label}</button>`)
              .join("")}
          </div>
        </div>

        <div class="card only-desktop">
          <div class="table-wrap">
            <table class="table table--clickable">
              <thead><tr><th>#</th><th>Agent</th><th>Strategy</th><th>Stocks</th><th class="num">Return</th><th class="num">vs holding</th><th class="num">Worst drop</th><th class="num">Trades</th><th>Started</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
        <div class="leader-cards only-mobile">${cards}</div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Pages: legal + 404
  // ---------------------------------------------------------------------------

  function legalPage(kind) {
    const terms = kind === "terms";
    return `
      <div class="container page">
        <div class="prose">
          <a class="eyebrow" href="#/" style="text-decoration:none"><i class="ph ph-arrow-left"></i>Home</a>
          <h1 class="page__title" style="color:var(--color-text)">${terms ? "Terms" : "Privacy"}</h1>
          <p>Draft for the prototype. Final wording needs legal review before launch.</p>
          ${
            terms
              ? `<h2>Paper trading only</h2><p>Agents trade virtual money. Nothing on Sita is investment advice, and backtests do not predict future results.</p>
                 <h2>Who may use Sita</h2><p>Sita is not available to US persons or to residents of countries where stock tokens are restricted.</p>
                 <h2>Public agents</h2><p>Agent names, settings, trades and results are public and shown on the leaderboard.</p>`
              : `<h2>What we store</h2><p>Your wallet address, the country your sign in came from, and the agents you create.</p>
                 <h2>What we never store</h2><p>Private keys, seed phrases or any wallet balance. Signing in never moves funds.</p>`
          }
        </div>
      </div>`;
  }

  function notFoundPage() {
    return `
      <div class="container">
        <div class="not-found">
          <img src="img/icons/agent.png" alt="" width="120" height="120" />
          <span class="eyebrow">Error 404</span>
          <h1 class="page__title">This page went to cash</h1>
          <p class="muted">The link may be old, or the agent was removed.</p>
          <a class="button button--primary" href="#/">Back to home</a>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Login (Privy style): email code, Google or an external wallet.
  // Prototype only: nothing leaves the browser, every step is simulated.
  // ---------------------------------------------------------------------------

  const WALLETS = [
    { id: "metamask", name: "MetaMask", color: "#f6851b" },
    { id: "rabby", name: "Rabby", color: "#7084ff" },
    { id: "coinbase", name: "Coinbase Wallet", color: "#0052ff" },
    { id: "walletconnect", name: "WalletConnect", color: "#3b99fc" },
  ];

  const login = { screen: "start", email: "", wallet: null, then: null };

  function currentUser() {
    return state.user || null;
  }

  function userWallet() {
    return state.user ? state.user.wallet : DEMO_WALLET;
  }

  function userLabel(user) {
    return user.email ? user.email : shortAddress(user.wallet);
  }

  /** Opens the login modal; `then` runs after a successful login. */
  function openLogin(then) {
    login.screen = "start";
    login.email = "";
    login.wallet = null;
    login.then = then || null;
    const modal = document.getElementById("login-modal");
    renderLogin();
    if (!modal.open) modal.showModal();
  }

  function renderLogin() {
    const modal = document.getElementById("login-modal");
    const close = `<button class="privy__icon-button privy__close" type="button" data-login="close" aria-label="Close"><i class="ph ph-x"></i></button>`;
    const back = `<button class="privy__icon-button privy__back" type="button" data-login="back" aria-label="Back"><i class="ph ph-arrow-left"></i></button>`;
    const footer = `<p class="privy__footer"><i class="ph ph-shield-check"></i>Protected by Privy</p>`;
    let body = "";

    if (login.screen === "start") {
      body = `
        ${close}
        <img class="privy__logo" src="img/icons/app.png" alt="" width="56" height="56" />
        <h2 class="privy__title" id="login-title">Log in or sign up</h2>
        <form class="privy__email" data-login-form="email" novalidate>
          <i class="ph ph-envelope-simple"></i>
          <input type="email" name="email" placeholder="your@email.com" autocomplete="email" aria-label="Email address" value="${escapeHtml(login.email)}" />
          <button class="privy__submit" type="submit">Submit</button>
        </form>
        <span class="field-error" id="login-error" hidden>Enter a valid email address.</span>
        <button class="privy__option" type="button" data-login="google"><span class="privy__glyph" style="background:#fff;border:1px solid var(--color-border-strong)"><i class="ph-fill ph-google-logo" style="color:#4285f4"></i></span>Continue with Google</button>
        <button class="privy__option" type="button" data-login="wallets"><span class="privy__glyph" style="background:var(--color-purple-8);color:var(--color-purple-rich)"><i class="ph ph-wallet"></i></span>Continue with a wallet<i class="ph ph-caret-right privy__chevron"></i></button>
        <p class="privy__note">New here? An account and a secure wallet are created for you. Paper trading needs no funds.</p>
        ${footer}`;
    } else if (login.screen === "code") {
      body = `
        ${back}${close}
        <span class="privy__badge"><i class="ph ph-envelope-simple-open"></i></span>
        <h2 class="privy__title" id="login-title">Enter confirmation code</h2>
        <p class="privy__text">Please check <strong>${escapeHtml(login.email)}</strong> for an email from privy.io and enter your code below.</p>
        <div class="privy__code" role="group" aria-label="6 digit code">
          ${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}" data-code="${i}" />`).join("")}
        </div>
        <p class="privy__note">Prototype: any 6 digits work. <button class="privy__link" type="button" data-login="resend">Resend code</button></p>
        ${footer}`;
    } else if (login.screen === "wallets") {
      body = `
        ${back}${close}
        <h2 class="privy__title" id="login-title" style="margin-top:var(--space-300)">Connect a wallet</h2>
        <div class="privy__wallets">
          ${WALLETS.map(
            (wallet) => `
            <button class="privy__option" type="button" data-wallet="${wallet.id}">
              <span class="privy__glyph" style="background:${wallet.color};color:#fff">${wallet.name.charAt(0)}</span>${wallet.name}
              ${wallet.id === "metamask" ? '<span class="pill" style="margin-left:auto">Detected</span>' : '<i class="ph ph-caret-right privy__chevron"></i>'}
            </button>`,
          ).join("")}
        </div>
        <p class="privy__note">Works with any wallet on Robinhood Chain.</p>
        ${footer}`;
    } else if (login.screen === "connecting") {
      const wallet = WALLETS.find((item) => item.id === login.wallet);
      const label = login.wallet === "google" ? "Signing in with Google" : wallet ? `Confirm in ${wallet.name}` : "Verifying your code";
      const detail =
        login.wallet === "google"
          ? "Choose your Google account in the popup."
          : wallet
            ? "Approve the connection, then sign the message. It is free and uses no gas."
            : "One moment.";
      body = `
        ${close}
        <span class="privy__pulse">${wallet ? `<span class="privy__glyph privy__glyph--big" style="background:${wallet.color};color:#fff">${wallet.name.charAt(0)}</span>` : `<img src="img/icons/app.png" alt="" width="56" height="56" />`}</span>
        <h2 class="privy__title" id="login-title">${label}</h2>
        <p class="privy__text">${detail}</p>
        ${footer}`;
    } else if (login.screen === "done") {
      const user = currentUser();
      body = `
        <span class="privy__badge privy__badge--ok"><i class="ph ph-check"></i></span>
        <h2 class="privy__title" id="login-title">You're in</h2>
        <p class="privy__text">${user.walletKind === "embedded" ? `We created a secure wallet for you: <strong class="mono">${shortAddress(user.wallet)}</strong>` : `Connected <strong class="mono">${shortAddress(user.wallet)}</strong>`}</p>
        ${footer}`;
    }

    modal.innerHTML = `<div class="privy">${body}</div>`;
    modal.querySelector('input[name="email"]')?.focus();
    modal.querySelector('[data-code="0"]')?.focus();
  }

  function finishLogin(user) {
    state.user = { ...user, createdAt: Date.now() };
    saveState();
    login.screen = "done";
    renderLogin();
    renderAppChrome();
    setTimeout(() => {
      document.getElementById("login-modal").close();
      const then = login.then;
      login.then = null;
      if (then) then();
      else rerender();
    }, 900);
  }

  function startConnecting(kind, user) {
    login.wallet = kind;
    login.screen = "connecting";
    renderLogin();
    setTimeout(() => finishLogin(user), 1300);
  }

  function bindLoginEvents() {
    const modal = document.getElementById("login-modal");

    modal.addEventListener("click", (event) => {
      const button = event.target.closest("[data-login]");
      const wallet = event.target.closest("[data-wallet]");
      if (event.target === modal) modal.close(); // click on the backdrop
      if (wallet) {
        startConnecting(wallet.dataset.wallet, { method: "wallet", wallet: DEMO_WALLET, walletKind: wallet.dataset.wallet });
        return;
      }
      if (!button) return;
      switch (button.dataset.login) {
        case "close":
          modal.close();
          break;
        case "back":
          login.screen = "start";
          renderLogin();
          break;
        case "wallets":
          login.screen = "wallets";
          renderLogin();
          break;
        case "google":
          startConnecting("google", { method: "google", email: "maya.santoso@gmail.com", wallet: EMBEDDED_WALLET, walletKind: "embedded" });
          break;
        case "resend":
          toast(`New code sent to ${login.email}`);
          break;
        default:
          break;
      }
    });

    modal.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.querySelector('input[name="email"]');
      const value = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        input.closest(".privy__email").setAttribute("aria-invalid", "true");
        modal.querySelector("#login-error").hidden = false;
        input.focus();
        return;
      }
      login.email = value;
      login.screen = "code";
      renderLogin();
    });

    // OTP boxes: auto advance, backspace goes back, paste fills all six.
    modal.addEventListener("input", (event) => {
      const box = event.target.closest("[data-code]");
      if (!box) return;
      box.value = box.value.replace(/\D/g, "").slice(-1);
      const boxes = [...modal.querySelectorAll("[data-code]")];
      const next = boxes[Number(box.dataset.code) + 1];
      if (box.value && next) next.focus();
      if (boxes.every((item) => item.value)) {
        startConnecting("email", { method: "email", email: login.email, wallet: EMBEDDED_WALLET, walletKind: "embedded" });
      }
    });

    modal.addEventListener("keydown", (event) => {
      const box = event.target.closest("[data-code]");
      if (box && event.key === "Backspace" && !box.value) {
        modal.querySelector(`[data-code="${Number(box.dataset.code) - 1}"]`)?.focus();
      }
    });

    modal.addEventListener("paste", (event) => {
      const box = event.target.closest("[data-code]");
      if (!box) return;
      const digits = (event.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (digits.length < 6) return;
      event.preventDefault();
      modal.querySelectorAll("[data-code]").forEach((item, i) => (item.value = digits[i]));
      startConnecting("email", { method: "email", email: login.email, wallet: EMBEDDED_WALLET, walletKind: "embedded" });
    });
  }

  function logout() {
    state.user = null;
    saveState();
    renderAppChrome();
    location.hash = "#/";
    toast("Logged out");
  }

  /** Header CTA, sidebar account block and mobile top bar reflect the login state. */
  function renderAppChrome() {
    const user = currentUser();
    document.getElementById("wallet-slot").innerHTML = `<button class="button button--primary button--small" type="button" data-action="go-to-app">${user ? "Open app" : "Go to app"}<i class="ph ph-arrow-right"></i></button>`;

    const avatar = user
      ? `<span class="avatar" aria-hidden="true">${escapeHtml((user.email || "W").charAt(0).toUpperCase())}</span>`
      : `<span class="avatar avatar--empty" aria-hidden="true"><i class="ph ph-user"></i></span>`;

    document.getElementById("account-slot").innerHTML = user
      ? `<div class="account">
          ${avatar}
          <span class="account__text"><strong>${escapeHtml(userLabel(user))}</strong><span class="mono">${user.email ? shortAddress(user.wallet) : WALLETS.find((item) => item.id === user.walletKind)?.name || "Wallet"}</span></span>
          <button class="privy__icon-button" type="button" data-action="logout" aria-label="Log out" title="Log out"><i class="ph ph-sign-out"></i></button>
        </div>`
      : `<button class="button button--primary" type="button" data-action="login" style="width:100%">Log in</button>`;

    document.getElementById("topbar-account").innerHTML = user
      ? `<button class="avatar-button" type="button" data-action="go-to-app" aria-label="Open your dashboard">${avatar}</button>`
      : `<button class="button button--primary button--small" type="button" data-action="login">Log in</button>`;
  }

  // ---------------------------------------------------------------------------
  // Page: dashboard
  // ---------------------------------------------------------------------------

  function greeting() {
    const hour = new Date().getHours();
    return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }

  function dashboardPage() {
    const user = currentUser();
    if (!user) {
      return `
        <div class="container page">
          <div class="card"><div class="empty" style="padding:var(--space-800) var(--space-300)">
            <img src="img/icons/app.png" alt="" width="88" height="88" />
            <h1 class="page__title">Log in to Sita</h1>
            <p>Use Google, your email or a wallet. Your dashboard keeps your agents, their results and your account in one place.</p>
            <button class="button button--primary button--large" type="button" data-action="login">Log in or sign up</button>
          </div></div>
        </div>`;
    }

    const agents = state.myAgents
      .slice()
      .reverse()
      .map((agent) => {
        const view = myAgentView(agent);
        const run = agent.skippedHours > 0 ? runAgent(view) : null;
        return { agent, view, run };
      });
    const active = agents.find((item) => item.agent.status === "active");
    const totalStart = agents.reduce((sum, item) => sum + item.agent.capital, 0);
    const totalNow = agents.reduce((sum, item) => sum + (item.run ? item.run.result.finalEquity : item.agent.capital), 0);
    const totalReturn = totalStart ? (totalNow / totalStart - 1) * 100 : 0;
    const name = user.email ? user.email.split("@")[0].split(/[._]/)[0] : "trader";
    const prettyName = name.charAt(0).toUpperCase() + name.slice(1);

    const agentCards = agents
      .map(({ agent, view, run }) => {
        const values = run ? run.result.runs.map((item) => item.equity) : [];
        const min = Math.min(...values);
        const max = Math.max(...values);
        const points = values
          .filter((_, i) => i % 4 === 0)
          .map((value, i, list) => `${((i / Math.max(1, list.length - 1)) * 100).toFixed(1)},${(30 - ((value - min) / (max - min || 1)) * 26).toFixed(1)}`)
          .join(" ");
        return `
          <a class="agent-card" href="#/agent/${agent.id}">
            <div class="agent-card__head">
              <img src="img/icons/${agent.strategy === "momentum" ? "momentum" : "mean-reversion"}.png" alt="" width="44" height="44" />
              ${statusPill(agent.status)}
            </div>
            <div>
              <h3 class="card__title">${escapeHtml(agent.name)}</h3>
              <p class="muted" style="font-size:13px;line-height:18px">${strategyLabel(agent.strategy)} · ${agent.symbols.join(", ")}</p>
            </div>
            ${run ? `<svg viewBox="0 0 100 32" preserveAspectRatio="none" style="width:100%;height:32px" aria-hidden="true"><polyline points="${points}" fill="none" stroke="var(--color-purple-rich)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>` : agent.status === "active"
                ? `<div class="agent-card__waiting"><span class="pulse"></span>First decision in ${minutesToNextRun()} min</div>`
                : `<div class="agent-card__waiting"><i class="ph ph-pause"></i>Paused, not trading</div>`}
            <div class="agent-card__foot">
              <span>Value<strong>${usd(run ? run.result.finalEquity : agent.capital)}</strong></span>
              <span style="text-align:right">Return<strong class="${run ? tone(run.result.returnPct) : ""}">${run ? percent(run.result.returnPct) : "0.0%"}</strong></span>
            </div>
          </a>`;
      })
      .join("");

    const recent = active && active.run
      ? active.run.result.runs
          .slice()
          .reverse()
          .flatMap((item) => item.decisions.map((decision) => ({ ...decision, index: item.index })))
          .slice(0, 4)
      : [];

    const topAgents = SAMPLE_AGENTS.map((agent) => ({ agent, ...runAgent(agent) }))
      .sort((a, b) => b.result.returnPct - a.result.returnPct)
      .slice(0, 3);

    return `
      <div class="container page">
        <div class="page__head">
          <div>
            <span class="eyebrow">${greeting()}</span>
            <h1 class="page__title" style="margin-top:var(--space-75)">${escapeHtml(prettyName)}'s desk</h1>
          </div>
          <a class="button button--primary" href="#/forge"><i class="ph ph-plus"></i>New agent</a>
        </div>

        <div class="dash-stats">
          <div class="dash-stat dash-stat--accent">
            <span class="stat__label">Paper balance</span>
            <span class="dash-stat__value">${usd(totalNow || 10000)}</span>
            <span class="muted" style="font-size:13px;line-height:18px">Virtual dollars across your agents</span>
          </div>
          <div class="dash-stat">
            <span class="stat__label">Running agents</span>
            <span class="dash-stat__value">${activeAgentCount()} <span class="muted" style="font-size:18px;font-weight:450">of ${MAX_ACTIVE_AGENTS}</span></span>
            <span class="muted" style="font-size:13px;line-height:18px">${active ? `Newest: ${escapeHtml(active.agent.name)}` : "Run up to 5 agents at once"}</span>
          </div>
          <div class="dash-stat">
            <span class="stat__label">All time return</span>
            <span class="dash-stat__value ${tone(totalReturn)}">${percent(totalReturn)}</span>
            <span class="muted" style="font-size:13px;line-height:18px">${agents.length} ${agents.length === 1 ? "agent" : "agents"} built</span>
          </div>
        </div>

        <div class="dash-layout">
          <div class="stack">
            <div class="card-head" style="margin:var(--space-200) 0 0"><h2 class="card__title">Your agents</h2><a class="eyebrow" href="#/leaderboard" style="text-decoration:none">See the leaderboard<i class="ph ph-arrow-right"></i></a></div>
            <div class="agent-cards">
              ${agentCards}
              <a class="agent-card agent-card--new" href="#/forge">
                <img src="img/icons/agent.png" alt="" width="64" height="64" />
                <h3 class="card__title">${agents.length ? "Build another agent" : "Build your first agent"}</h3>
                <p class="muted" style="font-size:13px;line-height:18px">Replay 30 days of real prices before you launch.</p>
              </a>
            </div>

            <div class="card">
              <div class="card-head"><h2 class="card__title">Latest decisions</h2>${active ? `<a class="eyebrow" href="#/agent/${active.agent.id}" style="text-decoration:none">${escapeHtml(active.agent.name)}<i class="ph ph-arrow-right"></i></a>` : ""}</div>
              ${
                recent.length
                  ? `<div class="stack stack--tight">${recent.map((decision) => `<div>${decisionHtml(decision)}<span class="log-run__time" style="display:block;margin:4px 0 0 4px">${dateAt(decision.index)}</span></div>`).join("")}</div>`
                  : `<div class="empty"><img src="img/icons/backtest.png" alt="" width="64" height="64" /><p>${active ? "Your agent makes its first decision at the top of the hour." : "Launch an agent and its reasoning shows up here every hour."}</p></div>`
              }
            </div>
          </div>

          <div class="stack">
            <div class="card stack stack--tight">
              <h2 class="card__title">Account</h2>
              <div class="account" style="padding:0">
                <span class="avatar" aria-hidden="true">${escapeHtml((user.email || "W").charAt(0).toUpperCase())}</span>
                <span class="account__text"><strong>${escapeHtml(userLabel(user))}</strong><span>${user.method === "google" ? "Google" : user.method === "email" ? "Email" : WALLETS.find((item) => item.id === user.walletKind)?.name || "Wallet"} login</span></span>
              </div>
              <div class="wallet-box">
                <div class="growth__row" style="border:0;padding:0"><span class="muted">${user.walletKind === "embedded" ? "Sita wallet (by Privy)" : "Connected wallet"}</span><span class="pill pill--accent">Robinhood Chain</span></div>
                <div class="wallet-box__address mono">${shortAddress(user.wallet)}<button class="privy__icon-button" type="button" data-action="copy-wallet" aria-label="Copy wallet address"><i class="ph ph-copy"></i></button></div>
                <p class="muted" style="font-size:12px;line-height:16px">Paper trading needs no funds. This wallet will hold real stock tokens once live trading opens.</p>
              </div>
              <button class="button button--ghost" type="button" data-action="logout"><i class="ph ph-sign-out"></i>Log out</button>
            </div>

            <div class="card stack stack--tight">
              <div class="card-head" style="margin:0"><h2 class="card__title">Top agents</h2><img src="img/icons/leaderboard.png" alt="" width="36" height="36" /></div>
              ${topAgents
                .map(
                  (row, i) => `
                <a class="mini-row" href="#/agent/${row.agent.id}">
                  <span class="rank">${i + 1}</span>
                  <span style="flex:1;min-width:0"><strong>${escapeHtml(row.agent.name)}</strong><span class="muted" style="display:block;font-size:12px;line-height:16px">${row.agent.symbols.join(", ")}</span></span>
                  <span class="${tone(row.result.returnPct)}" style="font-weight:500">${percent(row.result.returnPct)}</span>
                </a>`,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Router + global events
  // ---------------------------------------------------------------------------

  function currentRoute() {
    const path = location.hash.replace(/^#/, "") || "/";
    const agentMatch = path.match(/^\/agent\/([\w-]+)$/);
    if (path === "/") return { name: "home", html: landingPage };
    if (path === "/app") return { name: "app", app: true, html: dashboardPage };
    if (path === "/forge") return { name: "forge", app: true, html: forgePage, bind: bindForge };
    if (path === "/leaderboard") return { name: "leaderboard", app: true, html: leaderboardPage };
    if (agentMatch) return { name: agentMatch[1].startsWith("mine") ? "mine" : "agent", app: true, html: () => agentPage(agentMatch[1]) };
    if (path === "/terms" || path === "/privacy") return { name: path.slice(1), html: () => legalPage(path.slice(1)) };
    return { name: "404", html: notFoundPage };
  }

  function render() {
    const route = currentRoute();
    chartRegistry.clear();
    // App pages get the sidebar shell, marketing pages the floating header.
    document.body.classList.toggle("is-app", Boolean(route.app));
    main.innerHTML = route.html();
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === route.name) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.title = { home: "Sita", app: "Dashboard · Sita", forge: "Forge · Sita", leaderboard: "Leaderboard · Sita", "404": "Not found · Sita" }[route.name] || "Sita";
    route.bind?.();
    bindCharts();
    splitWords();
    observeReveals();
    observeTagline();
  }

  function rerender() {
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
  }

  function navigate() {
    document.body.classList.remove("menu-open");
    document.querySelector(".nav__menu-button").setAttribute("aria-expanded", "false");
    render();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          // Odometer digits roll to their value: one digit column is 10 rows tall.
          entry.target.querySelectorAll?.("[data-digit]").forEach((digit) => {
            digit.style.transform = `translateY(-${Number(digit.dataset.digit)}em)`;
          });
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -10% 0px" },
  );

  // Headlines (.words), phones and odometers share the reveal observer: each
  // only needs an .is-visible class, the CSS does the motion.
  function observeReveals() {
    document
      .querySelectorAll(".reveal:not(.is-visible), .words:not(.is-visible), [data-phones]:not(.is-visible), [data-odometer]")
      .forEach((element) => revealObserver.observe(element));
  }

  /** Wraps every word of a .words headline in a span, keeping inner markup like .highlight. */
  function splitWords() {
    document.querySelectorAll(".words:not([data-split])").forEach((heading) => {
      let index = 0;
      const wrap = (node) => {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            wrap(child);
            return;
          }
          if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
          const fragment = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              fragment.append(part);
              return;
            }
            const word = document.createElement("span");
            word.className = "word";
            word.textContent = part;
            word.style.transitionDelay = `${index++ * 55}ms`;
            fragment.append(word);
          });
          child.replaceWith(fragment);
        });
      };
      wrap(heading);
      heading.dataset.split = "true";
    });
  }

  // Words light up one at a time as they cross a line 40% up from the bottom.
  const wordObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-lit");
          wordObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -40% 0px" },
  );

  function observeTagline() {
    document.querySelectorAll("[data-tagline]").forEach((element) => {
      const words = element.textContent.trim().split(/\s+/);
      element.innerHTML = words.map((word) => `<span class="tagline__word">${escapeHtml(word)}</span>`).join(" ");
      // Small per word delay keeps reading order even when a whole line crosses at once.
      element.querySelectorAll(".tagline__word").forEach((word, i) => {
        word.style.transitionDelay = `${(i % 8) * 60}ms`;
        wordObserver.observe(word);
      });
    });
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    const row = event.target.closest("tr[data-href]");

    const strategyLink = event.target.closest("[data-strategy-link]");
    if (strategyLink) forge.strategy = strategyLink.dataset.strategyLink;
    // Stock tiles open the Forge with that stock picked.
    const symbolLink = event.target.closest("[data-symbol-link]");
    if (symbolLink) forge.symbols = [symbolLink.dataset.symbolLink];

    if (row && !event.target.closest("a")) {
      location.hash = row.dataset.href;
      return;
    }
    if (event.target.closest(".nav__menu-button")) {
      const open = document.body.classList.toggle("menu-open");
      event.target.closest(".nav__menu-button").setAttribute("aria-expanded", String(open));
      return;
    }

    const skip = event.target.closest("[data-skip]");
    if (skip) {
      const mine = openOwnAgent();
      mine.skippedHours = Number(skip.dataset.skip);
      saveState();
      rerender();
      return;
    }

    const sort = event.target.closest("[data-sort]");
    const strategy = event.target.closest("[data-strategy]");
    const range = event.target.closest("[data-range]");
    if (sort) board.sort = sort.dataset.sort;
    if (strategy) board.strategy = strategy.dataset.strategy;
    if (range) agentView.range = range.dataset.range;
    if (sort || strategy || range) {
      rerender();
      return;
    }

    if (!action) return;
    switch (action.dataset.action) {
      case "go-to-app":
        if (currentUser()) location.hash = "#/app";
        else openLogin(() => (location.hash = "#/app"));
        break;
      case "login":
        openLogin(() => (location.hash === "#/app" ? rerender() : (location.hash = "#/app")));
        break;
      case "logout":
        logout();
        break;
      case "copy-wallet":
        navigator.clipboard?.writeText(userWallet()).then(
          () => toast("Wallet address copied"),
          () => toast("Copy failed"),
        );
        break;
      case "launch":
        openLaunchModal();
        break;
      case "close-modal":
        document.getElementById("launch-modal").close();
        break;
      case "share":
        navigator.clipboard?.writeText(location.href).then(
          () => toast("Link copied"),
          () => toast("Copy failed. Copy the address bar instead."),
        );
        break;
      case "toggle-pause": {
        const mine = openOwnAgent();
        if (mine.status !== "active" && activeAgentCount() >= MAX_ACTIVE_AGENTS) {
          toast(`You can run up to ${MAX_ACTIVE_AGENTS} agents. Pause another one first.`);
          break;
        }
        mine.status = mine.status === "active" ? "paused" : "active";
        saveState();
        toast(mine.status === "active" ? "Agent resumed" : "Agent paused");
        rerender();
        break;
      }
      case "toggle-holds":
        agentView.showHolds = action.checked;
        rerender();
        break;
      default:
        break;
    }
  });

  document.getElementById("data-date").textContent = dateAt(LAST_INDEX);
  new IntersectionObserver(([entry]) => {
    document.querySelector(".nav").classList.toggle("is-scrolled", !entry.isIntersecting);
  }).observe(document.querySelector(".prototype-banner"));

  // Footer newsletter: prototype validates only, nothing is stored or sent.
  document.getElementById("newsletter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("newsletter-email");
    const error = document.getElementById("newsletter-error");
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    error.hidden = valid;
    input.setAttribute("aria-invalid", String(!valid));
    if (!valid) {
      input.focus();
      return;
    }
    input.value = "";
    toast("You're on the list. One email a month.");
  });

  window.addEventListener("hashchange", navigate);
  bindLoginEvents();
  renderAppChrome();
  render();
})();
