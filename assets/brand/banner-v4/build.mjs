// X header v4 explorations (2026-11-04), one per reference the owner picked from real
// banners: 1 Zerion, 2 Phantom, 3 Hyperliquid, 8 Aave, 11 Base. Backgrounds for 2, 3 and
// 11 are low quality gpt-image-2 art (assets/banner-v4-prompts.json); 1 and 8 are CSS.
// All text is set here, never generated.
//
//   node assets/brand/banner-v4/build.mjs   (writes v4-<n>-*.html and .png next to it)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = new URL("./", import.meta.url);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const markSvg = (fill) =>
  readFileSync(new URL("../logo-v2/marks/zolva-mark-white.svg", dir), "utf8").replace('fill="#ffffff"', `fill="${fill}"`);

const base = `* { box-sizing: border-box; margin: 0; }
html, body { width: 1500px; height: 500px; overflow: hidden; }
body { position: relative; font-family: Inter, system-ui, sans-serif; }
.mark { display: block; } .mark svg { width: 100%; height: 100%; display: block; }`;
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=block" rel="stylesheet" />`;
// Generated art is 1536 x 1024: fill the width and keep the middle band.
const art = (file, position = "center") => `background: url("${file}") ${position} / 1500px auto no-repeat;`;

const banners = {
  "1-zerion": `
    <style>${base}
      body { background: radial-gradient(60% 120% at 85% 110%, rgba(152,150,255,.55), rgba(152,150,255,0) 60%), linear-gradient(120deg, #120d33 0%, #2a2190 55%, #5b50ea 100%); }
      .lock { position: absolute; left: 560px; top: 192px; display: flex; align-items: center; gap: 22px; color: #fff; }
      .lock .mark { width: 104px; height: 104px; }
      .lock span { font-size: 96px; font-weight: 700; letter-spacing: -0.045em; }
      .pill { position: absolute; padding: 10px 26px; border-radius: 22px; background: rgba(152,150,255,.45); color: #dcdbff; font-size: 54px; font-weight: 800; letter-spacing: -0.03em; }
      .p1 { left: 1050px; top: 56px; transform: rotate(-14deg); }
      .p2 { left: 1080px; top: 214px; }
      .p3 { left: 1040px; top: 360px; transform: rotate(12deg); }
    </style>
    <div class="lock"><span class="mark">${markSvg("#ffffff")}</span><span>zolva</span></div>
    <span class="pill p1">Agents</span><span class="pill p2">Paper</span><span class="pill p3">API</span>`,

  "2-phantom": `
    <style>${base}
      body { background: #1d1b22; }
      .art { position: absolute; inset: 0; ${art("v4-stickers.png", "right 46%")} }
      .lock { position: absolute; left: 330px; top: 150px; color: #fff; }
      .lock .mark { width: 92px; height: 92px; }
      .lock p { margin-top: 18px; font-size: 44px; font-weight: 800; line-height: 1.05; letter-spacing: -0.035em; }
      .lock p span { color: #9896ff; }
    </style>
    <div class="art"></div>
    <div class="lock"><span class="mark">${markSvg("#9896ff")}</span><p>Agents that<br /><span>show their work.</span></p></div>`,

  "3-hyperliquid": `
    <style>${base}
      body { background: #0d0b16; }
      .art { position: absolute; inset: 0; ${art("v4-dotwave.png", "center 52%")} }
      .lock { position: absolute; right: 64px; bottom: 44px; display: flex; align-items: center; gap: 12px; color: #e9e8ff; }
      .lock .mark { width: 34px; height: 34px; }
      .lock span { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
    </style>
    <div class="art"></div>
    <div class="lock"><span class="mark">${markSvg("#e9e8ff")}</span><span>Zolva</span></div>`,

  "8-aave": `
    <style>${base}
      body { background: #9896ff; display: flex; align-items: center; justify-content: center; }
      .line { display: flex; align-items: center; gap: 22px; color: #fff; font-size: 76px; font-weight: 700; letter-spacing: -0.04em; margin-top: -30px; }
      .line .mark { width: 74px; height: 74px; }
    </style>
    <div class="line">Agents that show their work<span class="mark">${markSvg("#ffffff")}</span>zolva</div>`,

  "11-base": `
    <style>${base}
      body { background: #ffffff; }
      .art { position: absolute; inset: 0; ${art("v4-pixels.png", "center 50%")} }
      .copy { position: absolute; left: 0; right: 0; top: 150px; text-align: center; color: #252228; }
      .copy p { font-size: 58px; font-weight: 600; line-height: 1.08; letter-spacing: -0.04em; }
      .copy .by { margin-top: 26px; display: inline-flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 600; color: #6a5ef5; }
      .copy .by .mark { width: 30px; height: 30px; }
    </style>
    <div class="art"></div>
    <div class="copy"><p>Trading agents that<br />show their work</p><span class="by"><span class="mark">${markSvg("#6a5ef5")}</span>zolvaagent.app</span></div>`,
};

for (const [name, body] of Object.entries(banners)) {
  const html = new URL(`v4-${name}.html`, dir);
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8" />${fonts}</head><body>${body}</body></html>`);
  const out = fileURLToPath(new URL(`v4-${name}.png`, dir));
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--user-data-dir=${process.env.TEMP}/edge-v4`, "--allow-file-access-from-files", "--virtual-time-budget=5000", "--window-size=1500,500", `--screenshot=${out}`, fileURLToPath(html).replace(/\\/g, "/").replace(/^/, "file:///")], { stdio: "ignore" });
  console.log(`wrote v4-${name}.png`);
}
