// Builds simplified small-size versions of the Zolva logo (favicon, tab icon) from the
// Figma SVG, which is one compound path: the badge, the Z cut out of it, and a small
// triangle cut out. Below about 32px the thin rim and the triangle break up, so:
//   s1  badge and Z cut, no triangle
//   s2  the Z alone, solid
//   s3  badge with a thicker rim (Z cut shrunk around its centre), no triangle
// Every version is cropped to its own bounds, so it fills the box it is drawn in.
//
//   node scripts/logo-small.mjs   (writes assets/brand/logo-v2/logo-zolva-small-*.svg)
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../assets/brand/logo-v2/", import.meta.url);
const source = readFileSync(new URL("logo-zolva-black.svg", dir), "utf8");
const d = source.match(/ d="([^"]+)"/)[1];

// Split into closed subpaths: badge, Z cut, triangle cut.
const subpaths = d.match(/M[^M]*/g).map((part) => part.trim());
if (subpaths.length !== 3) throw new Error(`expected 3 subpaths, found ${subpaths.length}`);
const [badge, zCut] = subpaths;

/** Absolute M/L/C/H/V/Z only (what Figma exported); applies f to every point. */
function transform(path, f) {
  const tokens = path.match(/[MLCHVZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const out = [];
  let command = "";
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i];
    if (/[MLCHVZ]/.test(token)) {
      command = token;
      out.push(token);
      i += 1;
      continue;
    }
    if (command === "H") {
      x = Number(token);
      out.push(f(x, y)[0].toFixed(3));
      i += 1;
    } else if (command === "V") {
      y = Number(token);
      out.push(f(x, y)[1].toFixed(3));
      i += 1;
    } else {
      x = Number(token);
      y = Number(tokens[i + 1]);
      const [nx, ny] = f(x, y);
      out.push(nx.toFixed(3), ny.toFixed(3));
      i += 2;
    }
  }
  return out.join(" ");
}

function bounds(path) {
  const xs = [];
  const ys = [];
  transform(path, (x, y) => (xs.push(x), ys.push(y), [x, y]));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const scaleAround = (path, factor) => {
  const b = bounds(path);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return transform(path, (x, y) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
};

function svg(paths, fill = "black") {
  const b = paths.map(bounds).reduce((a, c) => ({ minX: Math.min(a.minX, c.minX), maxX: Math.max(a.maxX, c.maxX), minY: Math.min(a.minY, c.minY), maxY: Math.max(a.maxY, c.maxY) }));
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const x = (b.minX + b.maxX) / 2 - size / 2;
  const y = (b.minY + b.maxY) / 2 - size / 2;
  return `<svg width="1000" height="1000" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)}" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path d="${paths.join(" ")}" fill-rule="evenodd" clip-rule="evenodd" fill="${fill}"/>\n</svg>\n`;
}

const versions = {
  s1: [badge, zCut],
  s2: [zCut],
  s3: [badge, scaleAround(zCut, 0.88)],
};
for (const [name, paths] of Object.entries(versions)) {
  writeFileSync(new URL(`logo-zolva-small-${name}.svg`, dir), svg(paths));
  console.log(`wrote logo-zolva-small-${name}.svg`);
}
