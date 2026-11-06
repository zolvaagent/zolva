// "Our bot skipped the funeral" quote tweet image (2026-11-06): Palantir Trend's sell receipt
// and the PLTR price around it, in the Morpho house style. Prices are PLTR's hourly closes
// from Zolva's candles table (every 3rd hour, Oct 18 to Nov 6); trades and the log line are
// the agent's real records (agent c7ac72b6, trades table and agent_runs 2026-10-30 13:00).
//
//   node assets/brand/banner-v4/build-pltr-receipt.mjs   (writes pltr-receipt.html and .png)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = new URL("./", import.meta.url);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

// [unix seconds, close]
const SERIES = [[1792281600,185.4],[1792292400,185.4],[1792303200,185.38],[1792314000,185.34],[1792324800,185.34],[1792335600,185.35],[1792346400,185.35],[1792357200,185.35],[1792368000,189.56],[1792378800,190.44],[1792389600,190.41],[1792400400,188.14],[1792411200,187.58],[1792422000,196.06],[1792432800,196.89],[1792443600,197.7],[1792454400,197.5],[1792465200,195.33],[1792476000,195.22],[1792486800,194.69],[1792497600,194.23],[1792508400,194],[1792519200,193.73],[1792530000,193.79],[1792540800,193.83],[1792551600,193.83],[1792562400,193.89],[1792573200,193.91],[1792584000,193.93],[1792594800,199.69],[1792605600,200.21],[1792616400,202.38],[1792627200,202.77],[1792638000,198.08],[1792648800,197.54],[1792659600,196.58],[1792670400,201.61],[1792681200,199.7],[1792692000,197.98],[1792702800,196.77],[1792713600,196.75],[1792724400,196.75],[1792735200,199.09],[1792746000,194.77],[1792756800,196.72],[1792767600,197.43],[1792778400,197.26],[1792789200,197.31],[1792800000,197.73],[1792810800,197.74],[1792821600,197.64],[1792832400,193.37],[1792843200,195.51],[1792854000,195.51],[1792864800,195.57],[1792875600,195.58],[1792886400,197.84],[1792897200,195.58],[1792908000,193.49],[1792918800,195.64],[1792929600,195.64],[1792940400,193.15],[1792951200,198.07],[1792962000,197.83],[1792972800,198.22],[1792983600,193.77],[1792994400,195.73],[1793005200,196.41],[1793016000,196.52],[1793026800,196.85],[1793037600,197.63],[1793048400,197.3],[1793059200,197.46],[1793070000,197.46],[1793080800,197.46],[1793091600,197.62],[1793102400,197.54],[1793113200,198.99],[1793124000,199.52],[1793134800,199.5],[1793145600,199.38],[1793156400,199.47],[1793167200,199.5],[1793178000,199.37],[1793188800,199.34],[1793199600,195.83],[1793210400,195.46],[1793221200,196.35],[1793232000,196.42],[1793242800,195.74],[1793253600,195.75],[1793264400,196.12],[1793275200,197.64],[1793286000,195.66],[1793296800,194.86],[1793307600,195.22],[1793318400,195.16],[1793329200,193.71],[1793340000,193.72],[1793350800,193.72],[1793361600,193.71],[1793372400,187.64],[1793383200,185.93],[1793394000,185.28],[1793404800,185.3],[1793415600,185.25],[1793426400,185.24],[1793437200,185.17],[1793448000,185.16],[1793458800,185.22],[1793469600,185.19],[1793480400,185.15],[1793491200,185.15],[1793502000,185.16],[1793512800,185.16],[1793523600,185.09],[1793534400,185.09],[1793545200,185.04],[1793556000,185.21],[1793566800,185],[1793577600,184.96],[1793588400,185.21],[1793599200,185.95],[1793610000,185.95],[1793620800,186.03],[1793631600,185.4],[1793642400,185.07],[1793653200,180.49],[1793664000,172.84],[1793674800,172.41],[1793685600,170.88],[1793696400,167.79],[1793707200,166.3],[1793718000,173.99],[1793728800,174.52],[1793739600,174.43],[1793750400,173.29],[1793761200,168.3],[1793772000,172.22],[1793782800,172.24],[1793793600,166.57],[1793804400,175.3],[1793815200,171.6],[1793826000,171.73],[1793836800,171.48],[1793847600,170.11],[1793858400,169.63],[1793869200,169.63],[1793880000,169.06],[1793890800,154.54],[1793901600,155.95],[1793912400,154.77],[1793923200,154.03]];
const BUY = { ts: Date.parse("2026-10-19T14:00:00Z") / 1000, price: 193.18 };
const SELL = { ts: Date.parse("2026-10-30T13:00:00Z") / 1000, price: 188.67 };

// The fills are exact hours; add them to the 3-hourly line so the dots sit on it.
for (const fill of [BUY, SELL]) SERIES.push([fill.ts, fill.price]);
SERIES.sort((a, b) => a[0] - b[0]);

// Chart box inside the card.
const W = 1100;
const H = 300;
const t0 = SERIES[0][0];
const t1 = SERIES.at(-1)[0];
const lo = 150;
const hi = 206;
const x = (t) => ((t - t0) / (t1 - t0)) * W;
const y = (p) => H - ((p - lo) / (hi - lo)) * H;
const path = SERIES.map(([t, p], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
const after = SERIES.filter(([t]) => t >= SELL.ts);
const afterPath = `M${x(SELL.ts).toFixed(1)},${y(SELL.price).toFixed(1)} ` + after.map(([t, p]) => `L${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
const last = SERIES.at(-1);

const svg = `<svg viewBox="-20 -20 ${W + 140} ${H + 70}" width="${W + 140}" height="${H + 70}" xmlns="http://www.w3.org/2000/svg">
  <path d="${path}" fill="none" stroke="#b9b4f5" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${afterPath}" fill="none" stroke="#e5482d" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="2 9"/>
  <line x1="${x(SELL.ts)}" y1="-10" x2="${x(SELL.ts)}" y2="${H + 10}" stroke="#252228" stroke-opacity=".18" stroke-width="2" stroke-dasharray="6 6"/>
  <circle cx="${x(BUY.ts)}" cy="${y(BUY.price)}" r="11" fill="#1f9d5c" stroke="#fff" stroke-width="4"/>
  <text x="${x(BUY.ts)}" y="${y(BUY.price) - 26}" text-anchor="middle" font-size="20" font-weight="600" fill="#1f9d5c">BUY $193.18</text>
  <circle cx="${x(SELL.ts)}" cy="${y(SELL.price)}" r="13" fill="#252228" stroke="#fff" stroke-width="4"/>
  <text x="${x(SELL.ts) + 24}" y="${y(SELL.price) - 24}" font-size="20" font-weight="600" fill="#252228">SELL $188.67 · Oct 30</text>
  <circle cx="${x(last[0])}" cy="${y(last[1])}" r="8" fill="#e5482d"/>
  <text x="${x(last[0]) + 18}" y="${y(last[1]) + 7}" font-size="20" font-weight="600" fill="#e5482d">$${last[1].toFixed(2)}</text>
  <text x="0" y="${H + 44}" font-size="16" fill="#252228" fill-opacity=".45">Oct 18</text>
  <text x="${W}" y="${H + 44}" text-anchor="end" font-size="16" fill="#252228" fill-opacity=".45">Nov 6</text>
</svg>`;

const html = `<!doctype html>
<!-- Generated by build-pltr-receipt.mjs; edit that file, not this one. -->
<html lang="en"><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Geist+Mono:wght@500&display=block" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1600px; height: 900px; overflow: hidden; }
  body { position: relative; font-family: Inter, system-ui, sans-serif; background: #c9c6ff; color: #252228; }
  .blob { position: absolute; border-radius: 50%; filter: blur(90px); }
  .b1 { width: 70%; height: 140%; left: -10%; top: -30%; background: #e9e8ff; }
  .b2 { width: 60%; height: 130%; left: 40%; top: -60%; background: #7d6dff; opacity: .9; }
  .b3 { width: 55%; height: 120%; left: 62%; top: 30%; background: #9e96ff; }
  .b4 { width: 40%; height: 90%; left: 20%; top: 55%; background: #b5b0ff; }
  .b6 { width: 52%; height: 95%; left: 24%; top: 6%; background: #8577ff; opacity: .85; }
  .grain { position: absolute; inset: 0; opacity: .08; background-image: radial-gradient(rgba(37,34,40,.6) .6px, transparent .8px); background-size: 3px 3px; }
  .card { position: absolute; left: 140px; right: 140px; top: 70px; bottom: 70px; border-radius: 32px; background: rgba(255,255,255,.94); box-shadow: 0 40px 100px -30px rgba(60,40,180,.55); padding: 44px 60px; display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; gap: 14px; font-size: 20px; color: rgba(37,34,40,.6); }
  .head img { width: 34px; height: 34px; }
  .head b { color: #252228; font-weight: 600; }
  .head .paper { margin-left: auto; padding: 6px 14px; border-radius: 999px; background: #f1f0fb; color: #5b4fe0; font-size: 16px; font-weight: 500; }
  .log { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: center; }
  .log .when { font-family: "Geist Mono", monospace; font-size: 20px; color: rgba(37,34,40,.55); white-space: nowrap; }
  .log .pill { padding: 6px 14px; border-radius: 10px; background: #252228; color: #fff; font-size: 18px; font-weight: 600; letter-spacing: .04em; }
  .log q { flex-basis: 100%; font-size: 34px; font-weight: 500; letter-spacing: -0.01em; }
  .chart { margin-top: 26px; flex: 1; display: flex; align-items: center; }
  .stats { display: flex; gap: 48px; align-items: baseline; }
  .stats div { font-size: 18px; color: rgba(37,34,40,.55); }
  .stats strong { display: block; margin-top: 2px; font-size: 40px; font-weight: 600; letter-spacing: -0.02em; color: #252228; }
  .stats .red { color: #e5482d; }
</style></head><body>
<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div><div class="blob b6"></div><div class="grain"></div>
<div class="card">
  <div class="head"><img src="../logo-v2/marks/zolva-mark-ink.svg" alt="" /><b>Palantir Trend</b> · decision log · $PLTR<span class="paper">Paper trading</span></div>
  <div class="log"><span class="when">Oct 30 · 13:00 UTC</span><span class="pill">SELL</span><q>Dropped to -3.3% versus the 48h average. Trend is broken, selling.</q></div>
  <div class="chart">${svg}</div>
  <div class="stats">
    <div>Agent since Oct 19<strong>-2.7%</strong></div>
    <div>Holding PLTR<strong class="red">-21.1%</strong></div>
    <div>PLTR after the sell, agent in cash<strong>$188.67 to $${last[1].toFixed(2)}</strong></div>
  </div>
</div>
</body></html>`;

const htmlPath = fileURLToPath(new URL("pltr-receipt.html", dir));
writeFileSync(htmlPath, html);
execFileSync(EDGE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--virtual-time-budget=6000",
  `--user-data-dir=${process.env.TEMP}/edge-pltr-receipt`, "--window-size=1600,900",
  `--screenshot=${fileURLToPath(new URL("pltr-receipt.png", dir))}`, `file:///${htmlPath.replace(/\\/g, "/")}`,
], { stdio: "ignore" });
console.log("wrote pltr-receipt.png");
