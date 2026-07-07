/**
 * Types for `wasm_vtracer`'s raw wasm-bindgen glue module. The package ships
 * a typed main entry (`wasm_vtracer` → `wasm_vtracer.js`) that eagerly
 * `import`s the `.wasm` (bundler-target magic). We instead import the pure-JS
 * `_bg.js` glue directly and instantiate the wasm by hand (see
 * `lineart-vtracer-wasm.ts`), which is bundler-agnostic and worker-safe — but
 * `_bg.js` has no `.d.ts`. Re-export the main entry's public types here and
 * add the internal wiring hook the manual instantiation needs.
 */
declare module "wasm_vtracer/wasm_vtracer_bg.js" {
  export * from "wasm_vtracer"
  /** wasm-bindgen wiring: hand the instantiated wasm exports to the glue. */
  export function __wbg_set_wasm(exports: unknown): void
}
