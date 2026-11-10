// Renders the Zolva logo set (2026-11-04) from the Figma SVGs in assets/brand/logo-v2:
// the white mark on the G1 "midnight violet" gradient. Headless Edge does the drawing,
// so gradients and anti-aliasing match the browser.
//
//   node scripts/logo-small.mjs      (first: builds the small S1 mark)
//   node scripts/render-brand.mjs
//
// Writes:
//   public/img/brand/zolva-mark.png        512, rounded tile, full logo (48px and up)
//   public/img/brand/zolva-mark-small.png  128, rounded tile, full logo (site header and badges, 24 to 32px)
//   public/img/brand/favicon-48.png        48, S1
//   public/img/brand/apple-touch-icon.png  180, square (iOS rounds it), full logo
//   public/icon.svg                        vector favicon, S1
//   assets/brand/logo-v2/x-avatar-400.png  400, square (X crops to a circle)
//   assets/brand/logo-v2/token-1000.png    1000, square, for GMGN and DEX listings
//   assets/brand/logo-v2/token-1000-bright.png  same, with a larger lavender glow
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const logoDir = new URL("assets/brand/logo-v2/", root);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const pathOf = (file) => readFileSync(new URL(file, logoDir), "utf8").match(/ d="([^"]+)"/)[1];
const full = pathOf("logo-zolva-black.svg");
const small = pathOf("logo-zolva-small-s1.svg");
// Both marks share the S1 crop (the triangle sits inside the badge), so they fill a tile alike.
const viewBox = readFileSync(new URL("logo-zolva-small-s1.svg", logoDir), "utf8").match(/viewBox="([^"]+)"/)[1];

const G1 = "radial-gradient(120% 120% at 100% 100%, #9896ff 0%, rgba(152,150,255,0) 45%), linear-gradient(135deg, #15103a 0%, #2e2490 50%, #6a5ef5 100%)";
const G1_BRIGHT = "radial-gradient(130% 130% at 100% 100%, #b4b2ff 0%, rgba(152,150,255,0) 60%), linear-gradient(135deg, #2a2180 0%, #4b3fd6 50%, #8075ff 100%)";

/** One tile: size px, rounded or square, mark at `fill` share of the tile. */
function tileHtml({ size, path, rounded, background = G1, fill = 0.66 }) {
  const radius = rounded ? Math.round(size * 0.22) : 0;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${size}px; height: ${size}px; background: transparent; overflow: hidden; }
    .t { width: ${size}px; height: ${size}px; border-radius: ${radius}px; background: ${background}; display: flex; align-items: center; justify-content: center; }
    svg { width: ${fill * 100}%; height: ${fill * 100}%; display: block; }
  </style></head><body><div class="t"><svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill-rule="evenodd" fill="#ffffff"/></svg></div></body></html>`;
}

const work = join(tmpdir(), "zolva-brand-render");
mkdirSync(work, { recursive: true });

function render(target, options) {
  const html = join(work, "tile.html");
  writeFileSync(html, tileHtml(options));
  const out = fileURLToPath(new URL(target, root));
  execFileSync(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    `--user-data-dir=${join(work, "profile")}`,
    `--window-size=${options.size},${options.size}`,
    `--screenshot=${out}`,
    `file:///${html.replace(/\\/g, "/")}`,
  ], { stdio: "ignore" });
  console.log(`wrote ${target}`);
}

// VARIANT=marks renders the mark alone on a transparent background, 1024px, cropped with
// a small margin, into assets/brand/logo-v2/marks: white, black, lavender, and one filled
// with the G1 gradient (for light backgrounds).
if (process.env.VARIANT === "marks") {
  mkdirSync(new URL("marks/", logoDir), { recursive: true });
  const fills = {
    white: "#ffffff",
    black: "#000000",
    ink: "#252228",
    lavender: "#9896ff",
    gradient: "url(#g1)",
  };
  for (const [name, fill] of Object.entries(fills)) {
    const html = join(work, "mark.html");
    writeFileSync(
      html,
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}svg{width:1024px;height:1024px;display:block}</style></head><body>
<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15103a"/><stop offset="0.5" stop-color="#2e2490"/><stop offset="1" stop-color="#6a5ef5"/></linearGradient></defs><path d="${full}" fill-rule="evenodd" fill="${fill}"/></svg></body></html>`,
    );
    const target = `assets/brand/logo-v2/marks/zolva-mark-${name}-1024.png`;
    execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000", `--user-data-dir=${join(work, "profile")}`, "--window-size=1024,1024", `--screenshot=${fileURLToPath(new URL(target, root))}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: "ignore" });
    console.log(`wrote ${target}`);
  }
  // The same, as SVGs with the crop applied, for Figma, slides and the web.
  for (const [name, fill] of Object.entries(fills)) {
    const defs = name === "gradient" ? `<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15103a"/><stop offset="0.5" stop-color="#2e2490"/><stop offset="1" stop-color="#6a5ef5"/></linearGradient></defs>` : "";
    writeFileSync(new URL(`marks/zolva-mark-${name}.svg`, logoDir), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs}<path d="${full}" fill-rule="evenodd" fill="${fill}"/></svg>\n`);
  }
  console.log("wrote the matching SVGs");
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

// VARIANT=g2 renders the G2 "ink glow" alternative into assets/brand/logo-v2/g2 only, for
// comparison; the site keeps G1.
if (process.env.VARIANT === "g2") {
  const G2 = "radial-gradient(90% 90% at 85% 100%, #8075ff 0%, rgba(128,117,255,0) 70%), radial-gradient(60% 60% at 0% 0%, rgba(152,150,255,0.35) 0%, rgba(152,150,255,0) 70%), #18161f";
  mkdirSync(new URL("g2/", logoDir), { recursive: true });
  render("assets/brand/logo-v2/g2/zolva-mark-g2.png", { size: 512, path: full, rounded: true, background: G2 });
  render("assets/brand/logo-v2/g2/zolva-mark-small-g2.png", { size: 128, path: full, rounded: true, background: G2 });
  render("assets/brand/logo-v2/g2/favicon-48-g2.png", { size: 48, path: small, rounded: true, background: G2 });
  render("assets/brand/logo-v2/g2/x-avatar-400-g2.png", { size: 400, path: full, rounded: false, fill: 0.56, background: G2 });
  render("assets/brand/logo-v2/g2/token-1000-g2.png", { size: 1000, path: full, rounded: false, fill: 0.6, background: G2 });
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

render("public/img/brand/zolva-mark.png", { size: 512, path: full, rounded: true });
render("public/img/brand/zolva-mark-small.png", { size: 128, path: full, rounded: true });
render("public/img/brand/favicon-48.png", { size: 48, path: small, rounded: true });
render("public/img/brand/apple-touch-icon.png", { size: 180, path: full, rounded: false });
render("assets/brand/logo-v2/x-avatar-400.png", { size: 400, path: full, rounded: false, fill: 0.56 });
// DexScreener token icon (2026-11-10): the X avatar at 512, square (DexScreener rounds it).
render("assets/brand/dex/dex-icon-512.png", { size: 512, path: full, rounded: false, fill: 0.56 });
render("assets/brand/logo-v2/token-1000.png", { size: 1000, path: full, rounded: false, fill: 0.6 });
render("assets/brand/logo-v2/token-1000-bright.png", { size: 1000, path: full, rounded: false, fill: 0.6, background: G1_BRIGHT });

// Vector favicon: the same tile as SVG (CSS gradients become SVG gradients).
const [vx, vy, vw] = viewBox.split(" ").map(Number);
const pad = (vw / 0.66 - vw) / 2;
const box = vw + 2 * pad;
writeFileSync(
  new URL("public/icon.svg", root),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(vx - pad).toFixed(2)} ${(vy - pad).toFixed(2)} ${box.toFixed(2)} ${box.toFixed(2)}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15103a"/><stop offset="0.5" stop-color="#2e2490"/><stop offset="1" stop-color="#6a5ef5"/></linearGradient>
<radialGradient id="glow" cx="1" cy="1" r="1.2"><stop offset="0" stop-color="#9896ff"/><stop offset="0.45" stop-color="#9896ff" stop-opacity="0"/></radialGradient>
</defs>
<rect x="${(vx - pad).toFixed(2)}" y="${(vy - pad).toFixed(2)}" width="${box.toFixed(2)}" height="${box.toFixed(2)}" rx="${(box * 0.22).toFixed(2)}" fill="url(#g)"/>
<rect x="${(vx - pad).toFixed(2)}" y="${(vy - pad).toFixed(2)}" width="${box.toFixed(2)}" height="${box.toFixed(2)}" rx="${(box * 0.22).toFixed(2)}" fill="url(#glow)"/>
<path d="${small}" fill-rule="evenodd" fill="#ffffff"/>
</svg>
`,
);
console.log("wrote public/icon.svg");
rmSync(work, { recursive: true, force: true });
