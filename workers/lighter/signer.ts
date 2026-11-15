/**
 * Lighter's official signer (lighter-go v1.0.12, web-wasm build) in the Worker. The files come from
 * `npm run lighter:signer`, which downloads the pinned release and checks its sha256 (vendor/ is not in git).
 *
 * The web build sets globals that each return a function returning a Promise:
 *   _createClientByPrv(prvHex, chainId, accountIndex, nonce, apiKeyIndex)()
 *   _signCreateOrder(account, market, clientOrderIndex, "base", "price", isAsk, type, timeInForce,
 *                    reduceOnly, "trigger", expiry, nonce)()
 *   _signUpdateLeverage(account, market, initialMarginFraction, marginMode, nonce)()
 * It never touches the network: nonces come from the handler.
 */
import "./vendor/wasm_exec.js";
import signerWasm from "./vendor/lighter-signer-web.wasm";

import { ORDER_TYPE_MARKET, TIME_IN_FORCE_IOC } from "../../lib/live/lighter.ts";
import type { AgentKey, SignedTx, Signer } from "./handler.ts";

type GoGlobals = typeof globalThis & {
  Go: new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> };
  _createClientByPrv(...args: unknown[]): () => Promise<{ error?: string }>;
  _signCreateOrder(...args: unknown[]): () => Promise<{ error?: string; txHash?: string; txInfo?: string }>;
  _signUpdateLeverage(...args: unknown[]): () => Promise<{ error?: string; txHash?: string; txInfo?: string }>;
};

let loading: Promise<GoGlobals> | null = null;
/** Accounts whose client is created in this isolate, by account index and key. */
const clients = new Set<string>();

function load(): Promise<GoGlobals> {
  loading ??= (async () => {
    const g = globalThis as GoGlobals;
    const go = new g.Go();
    const instance = await WebAssembly.instantiate(signerWasm, go.importObject);
    void go.run(instance);
    return g;
  })();
  return loading;
}

async function clientFor(key: AgentKey, accountIndex: number, chainId: number): Promise<GoGlobals> {
  const g = await load();
  const id = `${accountIndex}:${key.apiKeyIndex}`;
  if (!clients.has(id)) {
    const created = await g._createClientByPrv(key.privateKey, chainId, accountIndex, 0, key.apiKeyIndex)();
    if (created.error) throw new Error(`signer: ${created.error}`);
    clients.add(id);
  }
  return g;
}

function signed(result: { error?: string; txHash?: string; txInfo?: string }): SignedTx {
  if (result.error || !result.txInfo || !result.txHash) throw new Error(`signer: ${result.error ?? "no transaction"}`);
  return { txHash: result.txHash, txInfo: result.txInfo };
}

export function wasmSigner(chainId: number): Signer {
  return {
    async signOrder(key, accountIndex, order) {
      const g = await clientFor(key, accountIndex, chainId);
      return signed(
        await g._signCreateOrder(
          accountIndex,
          order.marketId,
          order.clientOrderIndex,
          String(order.baseAmount),
          String(order.price),
          order.isAsk ? 1 : 0,
          ORDER_TYPE_MARKET,
          TIME_IN_FORCE_IOC,
          order.reduceOnly ? 1 : 0,
          "0",
          0, // an immediate-or-cancel order has no expiry
          order.nonce,
        )(),
      );
    },
    async signLeverage(key, accountIndex, change) {
      const g = await clientFor(key, accountIndex, chainId);
      return signed(await g._signUpdateLeverage(accountIndex, change.marketId, change.fraction, change.marginMode, change.nonce)());
    },
  };
}
