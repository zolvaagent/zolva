/**
 * zolva-lighter Worker entry: wires the real fetch and Lighter's WASM signer into handler.ts.
 * Deployed on its own (`npm run lighter:deploy`), never routed publicly; the main Worker reaches it
 * through the LIGHTER service binding.
 */
import { handle, type LighterEnv } from "./handler.ts";
import { wasmSigner } from "./signer.ts";

const worker = {
  fetch(request: Request, env: LighterEnv): Promise<Response> {
    return handle(request, env, {
      fetch: (input, init) => fetch(input, init),
      signer: wasmSigner(Number(env.LIGHTER_CHAIN_ID)),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });
  },
};

export default worker;
