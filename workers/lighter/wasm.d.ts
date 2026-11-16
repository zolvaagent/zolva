// Wrangler turns a .wasm import into a compiled WebAssembly.Module.
declare module "*.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
