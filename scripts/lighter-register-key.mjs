/**
 * Registers a new Lighter API key for one Lighter account (sub-account), so zolva-lighter can trade it.
 * The owner signs ONE message with the wallet that owns the Lighter account; nothing else is needed.
 *
 *   npm run lighter:signer                                   (once: downloads the pinned signer)
 *   node scripts/lighter-register-key.mjs --network testnet --address 0xYourWallet [--account 123] [--key-index 4]
 *
 * What it does:
 * 1. Finds your Lighter accounts for --address (or uses --account) and the next nonce for the key slot.
 * 2. Makes a fresh key pair with Lighter's own signer and the message Lighter wants your wallet to sign.
 * 3. Opens http://127.0.0.1:8791: a page with one button that asks your browser wallet to sign that message.
 * 4. Sends the signed ChangePubKey to Lighter, checks the key is registered, and writes the key into
 *    workers/lighter/.dev.vars (gitignored) as LIGHTER_KEYS. The private key is never printed.
 * Then: copy that LIGHTER_KEYS value into the Worker secret (the script prints the command).
 *
 * A key can trade and withdraw only to your own address; it cannot send funds to anyone else.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const NETWORKS = {
  testnet: { api: "https://api.rh-testnet.lighter.xyz", chainId: 300 },
  mainnet: { api: "https://api.rh.lighter.xyz", chainId: 466324 },
};
const UA = { "user-agent": "zolva-lighter/1.0 (+https://zolvaagent.app)" };
const TX_CHANGE_PUB_KEY = 8;
const PORT = 8791;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []),
);
const network = NETWORKS[args.network ?? "testnet"];
if (!network) throw new Error("--network must be testnet or mainnet");
const address = String(args.address ?? "").toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("--address must be the wallet that owns the Lighter account");
const keyIndex = Number(args["key-index"] ?? 4);
// Lighter RH reserves 0-3 (its apps) and 157.
if (!Number.isInteger(keyIndex) || keyIndex < 4 || keyIndex > 254 || keyIndex === 157) throw new Error("--key-index must be 4-156 or 158-254");

const get = async (path) => {
  const response = await fetch(`${network.api}${path}`, { headers: UA });
  const body = await response.json();
  if (body.code !== 200) throw new Error(`${path.split("?")[0]}: ${body.message ?? body.code}`);
  return body;
};

// 1. The account.
const owned = await get(`/api/v1/accountsByL1Address?l1_address=${address}`);
const accounts = owned.sub_accounts.map((a) => ({ index: Number(a.index), collateral: a.collateral }));
console.log(`Lighter accounts of ${address}:`, accounts.map((a) => `${a.index} ($${Number(a.collateral).toFixed(2)})`).join(", "));
const accountIndex = args.account !== undefined ? Number(args.account) : accounts.length === 1 ? accounts[0].index : NaN;
if (!accounts.some((a) => a.index === accountIndex)) throw new Error("pick one with --account (it must belong to --address)");
const { nonce } = await get(`/api/v1/nextNonce?account_index=${accountIndex}&api_key_index=${keyIndex}`);

// 2. A fresh key and the message to sign, from Lighter's own signer.
const vendor = new URL("../workers/lighter/vendor/", import.meta.url);
if (!existsSync(new URL("lighter-signer-web.wasm", vendor))) throw new Error("run npm run lighter:signer first");
createRequire(import.meta.url)(new URL("wasm_exec.js", vendor).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(readFileSync(new URL("lighter-signer-web.wasm", vendor)), go.importObject);
void go.run(instance);
const client = await globalThis._createClient(randomBytes(32).toString("hex"), network.chainId, accountIndex, nonce, keyIndex)();
if (client.error || !client.body) throw new Error(`signer: ${client.error ?? "no message to sign"}`);
const message = String(client.body);

// 3. The page with one button.
const page = `<!doctype html><meta charset="utf-8"><title>Register a Zolva key on Lighter</title>
<body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px">
<h1 style="font-size:22px">Register Zolva's API key on Lighter (${args.network ?? "testnet"})</h1>
<p>Account <b>${accountIndex}</b>, key slot <b>${keyIndex}</b>. Sign with <b>${address}</b>. Signing is free: it is a message, not a transaction.</p>
<pre style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px">${message.replace(/</g, "&lt;")}</pre>
<button id="b" style="font-size:16px;padding:10px 18px">Sign with my wallet</button><p id="s"></p>
<script>
const msg = ${JSON.stringify(message)};
b.onclick = async () => {
  try {
    if (!window.ethereum) throw new Error("No browser wallet found. Open this page in the browser that has your wallet.");
    const [from] = await ethereum.request({ method: "eth_requestAccounts" });
    if (from.toLowerCase() !== ${JSON.stringify(address)}) throw new Error("Switch your wallet to ${address}.");
    const hex = "0x" + Array.from(new TextEncoder().encode(msg), (x) => x.toString(16).padStart(2, "0")).join("");
    const signature = await ethereum.request({ method: "personal_sign", params: [hex, from] });
    s.textContent = "Signed. Registering…";
    const r = await fetch("/signature", { method: "POST", body: signature });
    s.textContent = await r.text();
  } catch (e) { s.textContent = e.message; }
};
</script></body>`;

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  if (req.method === "POST" && req.url === "/signature") {
    let signature = "";
    for await (const chunk of req) signature += chunk;
    try {
      // 4. Sign ChangePubKey with the wallet's signature, send it, confirm, save the key.
      const tx = await globalThis._signChangePubKey(accountIndex, signature.trim(), nonce, keyIndex)();
      if (tx.error) throw new Error(tx.error);
      const sent = await fetch(`${network.api}/api/v1/sendTx`, {
        method: "POST",
        headers: { ...UA, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ tx_type: String(TX_CHANGE_PUB_KEY), tx_info: tx.txInfo }).toString(),
      }).then((r) => r.json());
      if (sent.code !== 200) throw new Error(`Lighter refused it: ${sent.message ?? sent.code}`);
      let registered = false;
      for (let i = 0; i < 10 && !registered; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const keys = await get(`/api/v1/apikeys?account_index=${accountIndex}&api_key_index=${keyIndex}`).catch(() => null);
        registered = Boolean(keys?.api_keys?.some((k) => String(k.public_key).replace(/^0x/, "") === String(client.pk).replace(/^0x/, "")));
      }
      saveKey(accountIndex, keyIndex, client.prv);
      const note = registered ? "Registered and checked on Lighter." : "Sent; Lighter has not shown the key yet. Check again in a minute.";
      res.writeHead(200).end(`${note} The key is saved in workers/lighter/.dev.vars. You can close this page.`);
      console.log(`\n${note}\nSaved LIGHTER_KEYS in workers/lighter/.dev.vars (gitignored). For the deployed Worker, run:\n  npx wrangler secret put LIGHTER_KEYS -c workers/lighter/wrangler.jsonc\nand paste the LIGHTER_KEYS value from that file.`);
    } catch (cause) {
      res.writeHead(400).end(`Not registered: ${cause.message}`);
      console.error("Not registered:", cause.message);
    }
    setTimeout(() => process.exit(0), 500);
    return;
  }
  res.writeHead(404).end();
});
server.listen(PORT, "127.0.0.1", () => console.log(`\nOpen http://127.0.0.1:${PORT} in the browser with your wallet, and press the button.`));

/** Merges { "<account>": { apiKeyIndex, privateKey } } into LIGHTER_KEYS in workers/lighter/.dev.vars. */
function saveKey(account, apiKeyIndex, privateKey) {
  const file = new URL("../workers/lighter/.dev.vars", import.meta.url);
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
  const current = lines.find((line) => line.startsWith("LIGHTER_KEYS="));
  const keys = current ? JSON.parse(current.slice("LIGHTER_KEYS=".length)) : {};
  keys[String(account)] = { apiKeyIndex, privateKey };
  const rest = lines.filter((line) => !line.startsWith("LIGHTER_KEYS="));
  writeFileSync(file, [...rest, `LIGHTER_KEYS=${JSON.stringify(keys)}`].join("\n") + "\n");
}
