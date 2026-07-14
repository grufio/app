/**
 * Client-side pipeline helpers for the Line Art preview dialog.
 *
 * The preview runs the SAME vtracer engine as the server (via WASM —
 * `lineart-vtracer-wasm.ts`), so it produces smooth spline region outlines that
 * match the Apply result.
 *
 * Pipeline (mirrors `filter-service/app/lineart.py::lineart_to_svg`, now
 * palette-direct):
 *   downscale → blur → coverage paint-map (`coverageSelectPaintMap`, the
 *   `top_n` port of the server's `select_paints`) → paint the flat real-paint
 *   RGBA (`rgbaFromPaintMap`) → WASM vtracer (color/spline/stacked) → snap each
 *   region's fill to the nearest palette chip (`snapPathFillsToPalette`, an
 *   idempotent guard now that the fills are already palette colours) → add a
 *   black stroke per region → compose `<g id="regions">` SVG
 *   (`buildLineartPreviewSvg`).
 *
 * Divergence from the server (documented, acceptable for a preview): the
 * selection is the `top_n` coverage port and does NOT branch on
 * `palette_restriction` — PAM is approximated as top_n here (v1). Also a
 * downscaled buffer, and `coverage-select` histograms ALL preview pixels while
 * the server subsamples ~12k. So the preview is ≈ (same palette + smooth style)
 * not byte-identical to Apply. The `merge_tiny_regions` + numbers passes are
 * server-only (skipped here).
 *
 * The stages are decomposed so React callers can memoize each against its deps.
 */
import { nearestPaletteIndex, rgb255ToOklab } from "@/lib/color/oklab"

import type { PaletteChip } from "./trace-cell-colors"

export type PreviewImage = {
  width: number
  height: number
  /** RGBA, row-major, 4 bytes per pixel. */
  rgba: Uint8ClampedArray
}

/**
 * Draw `source` onto a scratch canvas at the downscaled resolution
 * (max edge `maxEdgePx`, preserving aspect ratio) and read RGBA back.
 * Returns `null` if a 2D context isn't available (jsdom-safe).
 */
export function loadAndDownscale(args: {
  source: CanvasImageSource
  sourceWidth: number
  sourceHeight: number
  maxEdgePx: number
}): PreviewImage | null {
  const { source, sourceWidth, sourceHeight, maxEdgePx } = args
  if (sourceWidth <= 0 || sourceHeight <= 0) return null
  const scale = Math.min(1, maxEdgePx / Math.max(sourceWidth, sourceHeight))
  const w = Math.max(1, Math.round(sourceWidth * scale))
  const h = Math.max(1, Math.round(sourceHeight * scale))
  const work = document.createElement("canvas")
  work.width = w
  work.height = h
  const ctx = work.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, w, h)
  return { width: w, height: h, rgba: ctx.getImageData(0, 0, w, h).data }
}

/**
 * Separable Gaussian blur. `radius` ≤ 0 returns the input unchanged.
 * Kernel is built once per call; two passes (horizontal, vertical).
 */
export function gaussianBlur(image: PreviewImage, radius: number): PreviewImage {
  if (radius <= 0) return image
  const r = Math.max(1, Math.round(radius))
  const sigma = r / 2
  const kernel: number[] = []
  let kSum = 0
  for (let i = -r; i <= r; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(v)
    kSum += v
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= kSum

  const { width: w, height: h, rgba } = image
  const pass1 = new Uint8ClampedArray(rgba.length)
  const pass2 = new Uint8ClampedArray(rgba.length)

  // Horizontal pass.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sumR = 0, sumG = 0, sumB = 0
      for (let i = -r; i <= r; i += 1) {
        const sx = Math.max(0, Math.min(w - 1, x + i))
        const o = (y * w + sx) * 4
        const k = kernel[i + r]
        sumR += rgba[o] * k
        sumG += rgba[o + 1] * k
        sumB += rgba[o + 2] * k
      }
      const o = (y * w + x) * 4
      pass1[o] = sumR
      pass1[o + 1] = sumG
      pass1[o + 2] = sumB
      pass1[o + 3] = 255
    }
  }
  // Vertical pass.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sumR = 0, sumG = 0, sumB = 0
      for (let i = -r; i <= r; i += 1) {
        const sy = Math.max(0, Math.min(h - 1, y + i))
        const o = (sy * w + x) * 4
        const k = kernel[i + r]
        sumR += pass1[o] * k
        sumG += pass1[o + 1] * k
        sumB += pass1[o + 2] * k
      }
      const o = (y * w + x) * 4
      pass2[o] = sumR
      pass2[o + 1] = sumG
      pass2[o + 2] = sumB
      pass2[o + 3] = 255
    }
  }
  return { width: w, height: h, rgba: pass2 }
}

/**
 * Paint a flat real-paint RGBA buffer from a per-pixel paint map (full-palette
 * chip indices, e.g. from `coverageSelectPaintMap`). Every pixel carries its
 * selected paint's EXACT chip RGB — the colour-reduced image fed to vtracer, so
 * vtracer traces a handful of clean real-paint regions (not thousands). Replaces
 * the old K-means cluster-mean quantise: the fills are already palette-true, so
 * the post-trace snap is only an idempotent guard.
 *
 * Empty palette → a zero buffer (the pane gates on a loaded palette before
 * calling this, so that path is only hit in degenerate cases).
 */
export function rgbaFromPaintMap(args: {
  paintMap: Int32Array
  palette: ReadonlyArray<PaletteChip>
  width: number
  height: number
}): Uint8ClampedArray {
  const { paintMap, palette, width, height } = args
  const n = width * height
  const out = new Uint8ClampedArray(n * 4)
  if (palette.length === 0) return out
  for (let i = 0; i < n; i += 1) {
    const chip = palette[paintMap[i]]?.rgb ?? [0, 0, 0]
    const o = i * 4
    out[o] = chip[0]
    out[o + 1] = chip[1]
    out[o + 2] = chip[2]
    out[o + 3] = 255
  }
  return out
}

// vtracer emits self-closing `<path d="..." fill="#RRGGBB" transform="..."/>`
// elements. Match the whole element (path data + fill carry no `>`); parse the
// fill; splice a stroke in before the closing `/>` — mirrors the server's
// `extract_path_elements` / `add_stroke_to_path` / `snap_path_fills_to_palette`
// in `filter-service/app/lineart.py`.
const PATH_ELEMENT_RE = /<path\b[^>]*\/>/gi
const PATH_FILL_RE = /\bfill="(#[0-9A-Fa-f]{6})"/i

/** Every `<path .../>` element from a vtracer SVG envelope, raw markup. */
export function extractPathElements(svg: string): string[] {
  return svg.match(PATH_ELEMENT_RE) ?? []
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Snap every path's vtracer fill to the nearest palette chip — the same
 * single-step OKLab-nearest match the server runs in
 * `snap_path_fills_to_palette`. Returns the rewritten paths plus the sorted
 * set of palette indices actually used. An empty palette leaves the paths
 * untouched (raw vtracer fills), matching the server's no-palette branch.
 */
export function snapPathFillsToPalette(
  paths: ReadonlyArray<string>,
  palette: ReadonlyArray<PaletteChip>,
): { paths: string[]; indicesUsed: number[] } {
  if (palette.length === 0) return { paths: [...paths], indicesUsed: [] }
  const paletteOklab = palette.map((c) => c.oklab)
  const used = new Set<number>()
  const snapped = paths.map((path) => {
    const m = PATH_FILL_RE.exec(path)
    if (!m) return path
    const [r, g, b] = hexToRgb(m[1])
    const idx = nearestPaletteIndex(rgb255ToOklab(r, g, b), paletteOklab)
    used.add(idx)
    const [pr, pg, pb] = palette[idx].rgb
    return path.slice(0, m.index) + `fill="${rgbToHex(pr, pg, pb)}"` + path.slice(m.index + m[0].length)
  })
  return { paths: snapped, indicesUsed: [...used].sort((a, b) => a - b) }
}

/** Splice a `stroke` + `stroke-width` into a vtracer `<path .../>`. Idempotent
 * (leaves an already-stroked path alone), mirroring `add_stroke_to_path`. */
export function addStrokeToPath(path: string, color: string, width: number): string {
  if (path.includes('stroke="')) return path
  return path.replace("/>", ` stroke="${color}" stroke-width="${width}"/>`)
}

/**
 * Compose the final preview SVG: snap fills → add a black stroke per region →
 * wrap in `<g id="regions">`. The root SVG uses `width/height="100%"` +
 * `preserveAspectRatio="none"` so it fills its (pixel-sized) pane wrapper and
 * stretches to the display rect — the same display contract as the server
 * result via `prepareTraceSvg`. Structure matches
 * `filter-service/app/lineart.py` (minus the server-only numbers group).
 *
 * `strokeWidth` is in viewBox units. The pane passes
 * `line_thickness × (previewWidth / sourceFullWidth)` so the stroke's on-screen
 * thickness matches the full-resolution Apply result at the same zoom (the
 * downscaled preview viewBox is smaller, so an unscaled `line_thickness` would
 * render several times too fat).
 */
export function buildLineartPreviewSvg(args: {
  vtracerSvg: string
  width: number
  height: number
  palette: ReadonlyArray<PaletteChip>
  strokeWidth: number
}): { svg: string; indicesUsed: number[] } {
  const { vtracerSvg, width, height, palette, strokeWidth } = args
  const raw = extractPathElements(vtracerSvg)
  const { paths, indicesUsed } = snapPathFillsToPalette(raw, palette)
  const stroked = paths.map((p) => addStrokeToPath(p, "black", strokeWidth))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" ` +
    `viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<g id="regions">${stroked.join("")}</g>` +
    `</svg>`
  return { svg, indicesUsed }
}
