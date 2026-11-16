// Chop ranking card for the @ChopLogsApp follow-up DM (2026-11-15).
// Data: choplogs-chop-ranking.json, built from Zolva's public API (30 days of hourly closes per market).
//   node docs/outreach-assets/build-choplogs-ranking.mjs   (writes choplogs-chop-ranking.html and .png)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = new URL("./", import.meta.url);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const rows = JSON.parse(readFileSync(new URL("choplogs-chop-ranking.json", dir), "utf8"));
const logo = readFileSync(new URL("../../public/brand/lockup/zolva-lockup-ink.svg", dir), "utf8");

// "Clean chop": big swing with almost no net move. Same picks as the DM text.
const PICKS = new Set(["AMC", "TSLA", "SPCX", "MU", "BABA", "USO"]);
const maxSwing = Math.max(...rows.map((r) => r.swingPct));
const WIDTH = 1200;

const body = rows.map((r, i) => `
  <tr class="${PICKS.has(r.symbol) ? "pick" : ""}">
    <td class="rank">${i + 1}</td>
    <td class="sym">${r.symbol}${r.cls === "crypto" ? '<span class="tag">crypto</span>' : ""}</td>
    <td class="bar"><div class="track"><div class="net" style="width:${(r.netPct / maxSwing) * 100}%"></div><div class="swing" style="width:${(r.swingPct / maxSwing) * 100}%"></div></div></td>
    <td class="num">${Math.round(r.swingPct)}%</td>
    <td class="num">${r.netPct.toFixed(1)}%</td>
    <td class="num strong">${r.efficiency.toFixed(3)}</td>
    <td class="num ${r.movingHoursPct < 70 ? "thin" : ""}">${r.movingHoursPct}%</td>
  </tr>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=block" rel="stylesheet" />
<style>
  :root { --bg: #ffffff; --panel: #fafaf9; --border: #f1f1f0; --text: #252228; --muted: rgba(37,34,40,.65); --faint: #8f8e8e;
          --purple: #8075ff; --purple-soft: #e5e5ff; --purple-mid: #bcbbff; --loss: #e04400; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; background: var(--bg); }
  body { font-family: Inter, system-ui, sans-serif; color: var(--text); padding: 48px 56px 40px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .logo svg { height: 30px; width: auto; display: block; }
  h1 { font-size: 30px; font-weight: 600; letter-spacing: -.02em; margin-bottom: 8px; }
  .sub { font-size: 16px; color: var(--muted); line-height: 1.5; max-width: 760px; }
  table { width: 100%; border-collapse: collapse; font-size: 16px; }
  th { text-align: right; font-weight: 500; font-size: 13px; color: var(--faint); text-transform: uppercase; letter-spacing: .04em; padding: 0 12px 10px; border-bottom: 1px solid var(--border); }
  th.l { text-align: left; }
  td { padding: 9px 12px; border-bottom: 1px solid var(--border); }
  tr.pick td { background: var(--purple-soft); }
  tr.pick td.sym { color: var(--purple); }
  .rank { color: var(--faint); width: 40px; font-variant-numeric: tabular-nums; }
  .sym { font-weight: 600; width: 120px; }
  .tag { font-size: 11px; font-weight: 500; color: var(--faint); margin-left: 8px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); width: 120px; }
  .num.strong { color: var(--text); font-weight: 600; }
  .num.thin { color: var(--loss); }
  .bar { width: 340px; }
  .track { position: relative; height: 10px; border-radius: 5px; background: var(--panel); }
  .swing, .net { position: absolute; left: 0; top: 0; height: 10px; border-radius: 5px; }
  .swing { background: var(--purple-mid); }
  .net { background: var(--purple); z-index: 1; min-width: 3px; }
  .legend { display: flex; gap: 22px; font-size: 13px; color: var(--muted); margin: 18px 0 0; flex-wrap: wrap; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  footer { margin-top: 18px; font-size: 13px; color: var(--faint); line-height: 1.6; }
</style></head><body>
<header>
  <div>
    <h1>Which Robinhood Chain tokens chop the most</h1>
    <p class="sub">Last 30 days of hourly closes (721 per market) from each token's USDG pool on Robinhood Chain. Lower efficiency = more back-and-forth that goes nowhere.</p>
  </div>
  <div class="logo">${logo}</div>
</header>
<table>
  <thead><tr><th class="l">#</th><th class="l">Market</th><th class="l">Swing vs net move</th><th>Swing 30d</th><th>Net 30d</th><th>Efficiency</th><th>Moving hrs</th></tr></thead>
  <tbody>${body}</tbody>
</table>
<div class="legend">
  <span><span class="dot" style="background:var(--purple-mid)"></span>Swing: sum of every hourly move</span>
  <span><span class="dot" style="background:var(--purple)"></span>Net: start-to-end move</span>
  <span><span class="dot" style="background:var(--purple-soft)"></span>Clean chop: big swing, little net move</span>
  <span><span class="dot" style="background:var(--loss)"></span>Moving hrs under 70%: thin pool hours</span>
</div>
<footer>Data: zolvaagent.app/docs/public-api (GET /api/public/v1/markets/{symbol}), pulled 2026-11-15. Pool prices include some between-trade noise. Past price movement only; not a forecast and not investment advice.</footer>
</body></html>`;

const htmlUrl = new URL("choplogs-chop-ranking.html", dir);
writeFileSync(htmlUrl, html);
const height = 48 + 120 + 44 + rows.length * 41 + 40;
execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
  `--window-size=${WIDTH},${height}`, "--virtual-time-budget=4000",
  `--screenshot=${fileURLToPath(new URL("choplogs-chop-ranking.png", dir))}`, htmlUrl.href]);
console.log("ok", WIDTH, height);
