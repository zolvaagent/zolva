// Morpho-style (ref 5) X header and P18 tweet image: a soft, blurred lavender and violet
// colour field with a small white lockup in the centre. Pure CSS, no image generation.
//
//   node assets/brand/banner-v4/build-morpho.mjs   (writes morpho-banner.png and morpho-p18.png)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = new URL("./", import.meta.url);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const mark = readFileSync(new URL("../logo-v2/marks/zolva-mark-white.svg", dir), "utf8");

// Big blurred blobs over a pale lavender base: the "soft sky" look, in brand colours.
const field = `
  body { background: #c9c6ff; }
  .blob { position: absolute; border-radius: 50%; filter: blur(90px); }
  .b1 { width: 70%; height: 140%; left: -10%; top: -30%; background: #e9e8ff; }
  .b2 { width: 60%; height: 130%; left: 40%; top: -60%; background: #7d6dff; opacity: .9; }
  .b3 { width: 55%; height: 120%; left: 62%; top: 30%; background: #9e96ff; }
  .b4 { width: 40%; height: 90%; left: 20%; top: 55%; background: #b5b0ff; }
  .b5 { width: 30%; height: 70%; left: 2%; top: -20%; background: #f4f3ff; opacity: .7; }
  .b6 { width: 52%; height: 95%; left: 24%; top: 6%; background: #8577ff; opacity: .85; }
  .grain { position: absolute; inset: 0; opacity: .08; background-image: radial-gradient(rgba(37,34,40,.6) .6px, transparent .8px); background-size: 3px 3px; }`;
const blobs = `<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div><div class="blob b5"></div><div class="blob b6"></div><div class="grain"></div>`;

const pages = {
  "morpho-banner": {
    size: [1500, 500],
    body: `
      <style>${field}
        .lock { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 10px; color: #fff; }
        .lock .m { width: 54px; height: 54px; } .lock .m svg { width: 100%; height: 100%; display: block; }
        .lock span { font-size: 34px; font-weight: 500; letter-spacing: -0.02em; }
      </style>${blobs}
      <div class="lock"><span class="m">${mark}</span><span>Zolva</span></div>`,
  },
  "morpho-p18": {
    size: [1600, 900],
    body: `
      <style>${field}
        .copy { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; color: #fff; }
        .copy .m { display: block; width: 64px; height: 64px; margin: 0 auto; } .copy .m svg { width: 100%; height: 100%; display: block; }
        h1 { margin-top: 30px; font-size: 92px; font-weight: 600; line-height: 1.02; letter-spacing: -0.045em; text-shadow: 0 2px 30px rgba(74, 60, 200, .25); }
        .code { display: inline-block; margin-top: 34px; padding: 12px 24px; border-radius: 999px; background: rgba(255,255,255,.22); border: 1px solid rgba(255,255,255,.45); font-family: "Geist Mono", monospace; font-size: 26px; font-weight: 500; }
      </style>${blobs}
      <div class="copy"><span class="m">${mark}</span><h1>Every decision,<br />open as JSON.</h1><span class="code">zolvaagent.app/api/public/v1</span></div>`,
  },
};

for (const [name, { size, body }] of Object.entries(pages)) {
  const html = new URL(`${name}.html`, dir);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8" /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=Geist+Mono:wght@500&display=block" rel="stylesheet" /><style>* { box-sizing: border-box; margin: 0; } html, body { width: ${size[0]}px; height: ${size[1]}px; overflow: hidden; } body { position: relative; font-family: Inter, system-ui, sans-serif; }</style></head><body>${body}</body></html>`,
  );
  const out = fileURLToPath(new URL(`${name}.png`, dir));
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--user-data-dir=${process.env.TEMP}/edge-morpho`, "--allow-file-access-from-files", "--virtual-time-budget=5000", `--window-size=${size[0]},${size[1]}`, `--screenshot=${out}`, "file:///" + fileURLToPath(html).replace(/\\/g, "/")], { stdio: "ignore" });
  console.log(`wrote ${name}.png`);
}
