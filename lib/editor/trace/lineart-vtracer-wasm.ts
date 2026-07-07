"use client"

/**
 * Client-side vtracer via WebAssembly — the preview counterpart to the
 * server's `filter-service/app/lineart.py`. It runs the SAME Rust engine
 * (visioncortex VTracer 0.6) with the SAME params, so the Line Art preview's
 * region geometry matches the Apply result instead of the old K-means raster
 * approximation. (Spike verified: identical pixels + params → byte-identical
 * SVG paths to the Python service.)
 *
 * Loading: `wasm_vtracer` ships a bundler-target wasm-bindgen build whose main
 * entry eagerly `import`s the `.wasm`. To stay bundler-agnostic (webpack AND
 * turbopack, dev AND prod) we import the pure-JS `_bg.js` glue directly and
 * instantiate the wasm by hand from `/public/wasm/` — no webpack
 * `asyncWebAssembly` flag, no worker-bundling. The ~140KB wasm is fetched +
 * instantiated lazily on the first trace and cached for the session.
 *
 * The `.wasm` under `public/wasm/` is a copy of
 * `node_modules/wasm_vtracer/wasm_vtracer_bg.wasm` (dep pinned to an exact
 * version); a unit test asserts the two stay byte-identical so a dependency
 * bump can't silently desync the served binary from the JS glue.
 */
import * as vt from "wasm_vtracer/wasm_vtracer_bg.js"

import { LINEART_VTRACER_CONFIG, smoothnessToVtracerParams } from "./lineart"

/** Public path of the copied wasm binary (served by Next from `public/`). */
export const WASM_VTRACER_URL = "/wasm/wasm_vtracer_bg.wasm"

let loadPromise: Promise<void> | null = null

/** Fetch + instantiate the wasm once; reuse the module for later calls.
 * Uses `arrayBuffer` + `instantiate` (not `instantiateStreaming`) so it does
 * not depend on the server sending `Content-Type: application/wasm`. */
function ensureWasm(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const res = await fetch(WASM_VTRACER_URL)
    if (!res.ok) {
      throw new Error(`wasm_vtracer: failed to fetch ${WASM_VTRACER_URL} (${res.status})`)
    }
    const bytes = await res.arrayBuffer()
    const { instance } = await WebAssembly.instantiate(bytes, {
      // The wasm imports its host bindings from the `_bg.js` module namespace;
      // copy its exports into a plain ModuleImports object (the namespace type
      // itself isn't a ModuleImports because it also carries enums/classes).
      "./wasm_vtracer_bg.js": Object.assign({} as WebAssembly.ModuleImports, vt),
    })
    vt.__wbg_set_wasm(instance.exports)
    // wasm-bindgen bundler builds run `__wbindgen_start` after wiring the wasm.
    const start = instance.exports.__wbindgen_start
    if (typeof start === "function") start()
    vt.init()
  })().catch((err) => {
    // Allow a later retry if the first load failed (transient fetch error).
    loadPromise = null
    throw err
  })
  return loadPromise
}

/**
 * Trace a colour-reduced RGBA image to a vtracer SVG string, matching the
 * server's lineart vtracer call: color / spline / cutout mode, shared config,
 * and `smoothness`-derived corner/length/speckle thresholds. The caller is
 * responsible for reducing the image to a small palette first (the server
 * median-cut-quantises before vtracer; the preview K-means-quantises), so
 * vtracer carves out a few clean regions rather than thousands.
 *
 * Async: lazily loads the wasm on the first call. Runs on the calling thread
 * (~30-100ms for a ≤384px preview buffer) — cheap enough that the pane just
 * debounces + shows a spinner instead of paying the worker-bundling cost.
 */
export async function traceRgbaToSvg(args: {
  rgba: Uint8ClampedArray
  width: number
  height: number
  smoothness: number
}): Promise<string> {
  const { rgba, width, height, smoothness } = args
  await ensureWasm()

  const { cornerThreshold, lengthThreshold, filterSpeckle } =
    smoothnessToVtracerParams(smoothness)

  const cfg = new vt.TracerConfig()
  try {
    cfg.setColorMode(vt.ColorMode.Color)
    cfg.setHierarchical(vt.Hierarchical.Cutout)
    cfg.setPathSimplifyMode(vt.PathSimplifyMode.Spline)
    cfg.setColorPrecision(LINEART_VTRACER_CONFIG.colorPrecision)
    cfg.setLayerDifference(LINEART_VTRACER_CONFIG.layerDifference)
    cfg.setPathPrecision(LINEART_VTRACER_CONFIG.pathPrecision)
    cfg.setSpliceThreshold(LINEART_VTRACER_CONFIG.spliceThreshold)
    cfg.setCornerThreshold(cornerThreshold)
    cfg.setLengthThreshold(lengthThreshold)
    cfg.setFilterSpeckle(filterSpeckle)
    // `convertImageToSvg` wants a Uint8Array; wrap the clamped buffer as a view
    // (no copy). RGBA, 4 bytes/pixel — same layout as canvas getImageData.
    const bytes = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)
    return vt.convertImageToSvg(bytes, width, height, cfg)
  } finally {
    cfg.free()
  }
}
