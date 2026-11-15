/**
 * Downloads Lighter's official WASM signer and Go's matching wasm_exec.js into workers/lighter/vendor/,
 * and refuses them unless their sha256 matches the pinned value. The files are not in git (7.6 MB binary).
 *
 *   npm run lighter:signer
 *
 * To upgrade: change the URLs and hashes together, after reading the release notes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const FILES = [
  {
    // lighter-go v1.0.12, web-wasm build (released 2026-10-19).
    url: "https://github.com/elliottech/lighter-go/releases/download/v1.0.12/lighter-signer-web.wasm",
    name: "lighter-signer-web.wasm",
    sha256: "95c9dd38373405691498c52c0feb72338e6bb00e90362227efe59fb12523c5ae",
  },
  {
    // The Go runtime glue for that build (lighter-go v1.0.12 is built with Go 1.26.0).
    url: "https://raw.githubusercontent.com/golang/go/go1.26.0/lib/wasm/wasm_exec.js",
    name: "wasm_exec.js",
    sha256: "0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14",
  },
];

const dir = new URL("../workers/lighter/vendor/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const file of FILES) {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`${file.name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== file.sha256) throw new Error(`${file.name}: sha256 ${hash} does not match the pinned ${file.sha256}`);
  writeFileSync(new URL(file.name, dir), bytes);
  console.log(`ok ${file.name} (${bytes.length} bytes)`);
}
