// Tweet images (1600 x 900) for P18, the public API, in the five v4 styles (refs 1 Zerion,
// 2 Phantom, 3 Hyperliquid, 8 Aave, 11 Base). Same backgrounds as the banners, no new
// image generation. The JSON line is a real decision from GET /api/public/v1/agents/8a0ab89f-...
//
//   node assets/brand/banner-v4/build-tweet.mjs   (writes p18-<n>-*.html and .png next to it)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = new URL("./", import.meta.url);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const markSvg = (fill) =>
  readFileSync(new URL("../logo-v2/marks/zolva-mark-white.svg", dir), "utf8").replace('fill="#ffffff"', `fill="${fill}"`);

const base = `* { box-sizing: border-box; margin: 0; }
html, body { width: 1600px; height: 900px; overflow: hidden; }
body { position: relative; font-family: Inter, system-ui, sans-serif; }
.mark { display: block; } .mark svg { width: 100%; height: 100%; display: block; }
.mono { font-family: "Geist Mono", monospace; }`;
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=Geist+Mono:wght@500;600&display=block" rel="stylesheet" />`;
const art = (file, position = "center") => `background: url("${file}") ${position} / 1600px auto no-repeat;`;
const decision = `{ "market": "TSLA", "action": "buy", "reasoning": "Price is unusually far below its 48h average (z -2.90). Buying the dip." }`;

const cards = {
  "1-zerion": `
    <style>${base}
      body { background: radial-gradient(60% 90% at 88% 105%, rgba(152,150,255,.55), rgba(152,150,255,0) 60%), linear-gradient(125deg, #120d33 0%, #2a2190 55%, #5b50ea 100%); color: #fff; }
      .lock { position: absolute; left: 120px; top: 120px; display: flex; align-items: center; gap: 18px; }
      .lock .mark { width: 64px; height: 64px; } .lock span { font-size: 58px; font-weight: 700; letter-spacing: -0.045em; }
      h1 { position: absolute; left: 120px; top: 300px; font-size: 140px; font-weight: 800; line-height: .95; letter-spacing: -0.055em; }
      .sub { position: absolute; left: 124px; top: 600px; font-size: 34px; font-weight: 500; color: rgba(255,255,255,.75); }
      .pill { position: absolute; padding: 12px 30px; border-radius: 26px; background: rgba(152,150,255,.45); color: #e2e1ff; font-size: 60px; font-weight: 800; letter-spacing: -0.03em; }
      .p1 { left: 1060px; top: 130px; transform: rotate(-12deg); } .p2 { left: 1110px; top: 360px; } .p3 { left: 1010px; top: 580px; transform: rotate(10deg); }
    </style>
    <div class="lock"><span class="mark">${markSvg("#ffffff")}</span><span>zolva</span></div>
    <h1>Public<br />API</h1><p class="sub">Every agent decision, open as JSON. No key.</p>
    <span class="pill mono p1">/agents</span><span class="pill mono p2">/markets</span><span class="pill mono p3">/activity</span>`,

  "2-phantom": `
    <style>${base}
      body { background: #1d1b22; color: #fff; }
      .art { position: absolute; inset: 0; ${art("v4-stickers.png", "right 40%")} }
      .copy { position: absolute; left: 110px; top: 200px; width: 760px; }
      .copy .mark { width: 96px; height: 96px; }
      h1 { margin-top: 36px; font-size: 84px; font-weight: 800; line-height: 1; letter-spacing: -0.045em; }
      h1 span { color: #9896ff; }
      .code { margin-top: 40px; display: inline-block; padding: 14px 22px; border-radius: 16px; background: #2a2731; border: 2px solid #3a3644; font-size: 26px; color: #c9c7ff; }
    </style>
    <div class="art"></div>
    <div class="copy"><span class="mark">${markSvg("#9896ff")}</span><h1>Every decision,<br /><span>open as JSON.</span></h1><span class="code mono">GET /api/public/v1/agents</span></div>`,

  "3-hyperliquid": `
    <style>${base}
      body { background: #0d0b16; color: #ecebff; }
      .art { position: absolute; left: 0; right: 0; bottom: -60px; height: 600px; ${art("v4-dotwave.png", "center 62%")} opacity: .9; -webkit-mask-image: linear-gradient(transparent 0%, #000 35%); mask-image: linear-gradient(transparent 0%, #000 35%); }
      .copy { position: absolute; left: 0; right: 0; top: 96px; text-align: center; }
      .copy p { font-size: 30px; color: rgba(236,235,255,.6); letter-spacing: .02em; }
      h1 { margin-top: 18px; font-size: 84px; font-weight: 600; letter-spacing: -0.04em; }
      .json { margin: 30px auto 0; width: 1040px; padding: 18px 26px; border-radius: 16px; background: rgba(13,11,22,.85); border: 1px solid rgba(152,150,255,.3); font-size: 21px; line-height: 32px; color: #b9b7ff; }
      .lock { position: absolute; right: 70px; bottom: 56px; display: flex; align-items: center; gap: 12px; }
      .lock .mark { width: 38px; height: 38px; } .lock span { font-size: 32px; font-weight: 600; }
    </style>
    <div class="art"></div>
    <div class="copy"><p class="mono">GET /api/public/v1</p><h1>Every decision, open.</h1><p class="json mono">${decision}</p></div>
    <div class="lock"><span class="mark">${markSvg("#ecebff")}</span><span>Zolva</span></div>`,

  "8-aave": `
    <style>${base}
      body { background: #9896ff; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .line { display: flex; align-items: center; gap: 24px; font-size: 92px; font-weight: 700; letter-spacing: -0.045em; }
      .line .mark { width: 88px; height: 88px; }
      .sub { margin-top: 34px; font-size: 32px; font-weight: 600; color: rgba(255,255,255,.85); }
    </style>
    <div class="line">Every decision, open<span class="mark">${markSvg("#ffffff")}</span>zolva</div>
    <p class="sub mono">GET /api/public/v1 · JSON · no key</p>`,

  "11-base": `
    <style>${base}
      body { background: #fff; color: #252228; }
      .art { position: absolute; inset: 0; ${art("v4-pixels.png", "center 50%")} }
      .copy { position: absolute; left: 0; right: 0; top: 250px; text-align: center; }
      h1 { font-size: 96px; font-weight: 600; line-height: 1.04; letter-spacing: -0.045em; }
      .code { margin-top: 44px; display: inline-flex; align-items: center; gap: 14px; padding: 14px 24px; border-radius: 14px; background: #f3f2ff; border: 1px solid #dcdbff; font-size: 28px; color: #4b3fd6; }
      .code .mark { width: 32px; height: 32px; }
    </style>
    <div class="art"></div>
    <div class="copy"><h1>Every trade's reason,<br />open as JSON</h1><span class="code mono"><span class="mark">${markSvg("#4b3fd6")}</span>zolvaagent.app/api/public/v1</span></div>`,
};

for (const [name, body] of Object.entries(cards)) {
  const html = new URL(`p18-${name}.html`, dir);
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8" />${fonts}</head><body>${body}</body></html>`);
  const out = fileURLToPath(new URL(`p18-${name}.png`, dir));
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--user-data-dir=${process.env.TEMP}/edge-p18`, "--allow-file-access-from-files", "--virtual-time-budget=5000", "--window-size=1600,900", `--screenshot=${out}`, "file:///" + fileURLToPath(html).replace(/\\/g, "/")], { stdio: "ignore" });
  console.log(`wrote p18-${name}.png`);
}
