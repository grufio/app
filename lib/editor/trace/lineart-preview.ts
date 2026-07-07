/**
 * Client-side pipeline helpers for the Line Art preview dialog.
 *
 * The preview runs the SAME vtracer engine as the server (via WASM —
 * `lineart-vtracer-wasm.ts`), so it produces smooth spline region outlines
 * that match the Apply result, not the old jagged K-means raster.
 *
 * Pipeline (mirrors `filter-service/app/lineart.py::lineart_to_svg`):
 *   downscale → blur → K-means quantise to `num_colors` → paint the flat
 *   quantised RGBA (`quantizedRgbaFromClusters`) → WASM vtracer (color/
 *   spline/cutout) → snap each region's fill to the nearest Munsell chip
 *   (`snapPathFillsToPalette`, same OKLab-nearest as the server) → add a
 *   black stroke per region → compose `<g id="regions">` SVG
 *   (`buildLineartPreviewSvg`).
 *
 * Divergence from the server (documented, acceptable for a preview): K-means
 * vs. PIL median-cut for the pre-vtracer quantise, and a downscaled buffer, so
 * the preview is ≈ (same smooth style) not byte-identical to Apply. The
 * `merge_tiny_regions` + numbers passes are server-only (skipped here).
 *
 * The downscale / blur / K-means stages are decomposed so React callers can
 * memoize each against its own deps.
 */
import { nearestPaletteIndex, rgb255ToOklab, type Oklab } from "@/lib/color/oklab"

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

export type KMeansResult = {
  centroids: Oklab[]
  /** Cluster index per pixel, row-major (`y * width + x`). */
  assignments: Uint16Array
}

/**
 * K-means in OKLab space. Seeded by K-means++ with a deterministic
 * mulberry32 PRNG (same input → same output, stable for tests). Up to
 * `maxIter` Lloyd iterations; converges early if assignments stop
 * changing. Empty clusters re-seed to a random pixel.
 */
export function kMeansOklab(image: PreviewImage, k: number, maxIter: number): KMeansResult {
  const { width, height, rgba } = image
  const n = width * height
  if (n === 0 || k <= 0) {
    return { centroids: [], assignments: new Uint16Array(0) }
  }

  // Precompute OKLab for every pixel — K-means runs entirely in OKLab.
  const labL = new Float32Array(n)
  const labA = new Float32Array(n)
  const labB = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const o = i * 4
    const lab = rgb255ToOklab(rgba[o], rgba[o + 1], rgba[o + 2])
    labL[i] = lab[0]
    labA[i] = lab[1]
    labB[i] = lab[2]
  }

  const kk = Math.min(k, n)
  const centroids: number[][] = []
  const rng = mulberry32(0xc0ffee ^ n)

  // K-means++ seeding: first centroid uniformly at random; each next picked
  // with probability proportional to squared distance to nearest existing.
  const firstIdx = Math.floor(rng() * n)
  centroids.push([labL[firstIdx], labA[firstIdx], labB[firstIdx]])
  const minDist = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const dl = labL[i] - centroids[0][0]
    const da = labA[i] - centroids[0][1]
    const db = labB[i] - centroids[0][2]
    minDist[i] = dl * dl + da * da + db * db
  }
  for (let c = 1; c < kk; c += 1) {
    let total = 0
    for (let i = 0; i < n; i += 1) total += minDist[i]
    const target = rng() * total
    let acc = 0
    let pick = n - 1
    for (let i = 0; i < n; i += 1) {
      acc += minDist[i]
      if (acc >= target) { pick = i; break }
    }
    centroids.push([labL[pick], labA[pick], labB[pick]])
    // Update minDist with the new centroid.
    for (let i = 0; i < n; i += 1) {
      const dl = labL[i] - centroids[c][0]
      const da = labA[i] - centroids[c][1]
      const db = labB[i] - centroids[c][2]
      const d = dl * dl + da * da + db * db
      if (d < minDist[i]) minDist[i] = d
    }
  }

  const assignments = new Uint16Array(n)
  for (let iter = 0; iter < maxIter; iter += 1) {
    // Assignment step.
    let changed = false
    for (let i = 0; i < n; i += 1) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centroids.length; c += 1) {
        const dl = labL[i] - centroids[c][0]
        const da = labA[i] - centroids[c][1]
        const db = labB[i] - centroids[c][2]
        const d = dl * dl + da * da + db * db
        if (d < bestD) { bestD = d; best = c }
      }
      if (assignments[i] !== best) {
        changed = true
        assignments[i] = best
      }
    }
    if (!changed && iter > 0) break

    // Update step: arithmetic mean per cluster.
    const sumsL = new Float64Array(centroids.length)
    const sumsA = new Float64Array(centroids.length)
    const sumsB = new Float64Array(centroids.length)
    const counts = new Uint32Array(centroids.length)
    for (let i = 0; i < n; i += 1) {
      const c = assignments[i]
      sumsL[c] += labL[i]
      sumsA[c] += labA[i]
      sumsB[c] += labB[i]
      counts[c] += 1
    }
    for (let c = 0; c < centroids.length; c += 1) {
      if (counts[c] > 0) {
        centroids[c][0] = sumsL[c] / counts[c]
        centroids[c][1] = sumsA[c] / counts[c]
        centroids[c][2] = sumsB[c] / counts[c]
      } else {
        // Re-seed an empty cluster to a random pixel — deterministic via the
        // same PRNG so tests stay stable.
        const reseed = Math.floor(rng() * n)
        centroids[c][0] = labL[reseed]
        centroids[c][1] = labA[reseed]
        centroids[c][2] = labB[reseed]
      }
    }
  }

  return {
    centroids: centroids.map((c) => [c[0], c[1], c[2]] as Oklab),
    assignments,
  }
}

export type SnappedCentroid = { r: number; g: number; b: number }

/**
 * Snap each centroid (OKLab) to the nearest palette chip's RGB. Empty
 * palette returns a fallback grey ramp so the canvas is still visible.
 */
export function snapCentroidsToPalette(
  centroids: ReadonlyArray<Oklab>,
  palette: ReadonlyArray<PaletteChip>,
): SnappedCentroid[] {
  if (palette.length === 0) {
    return centroids.map((c) => {
      const v = Math.max(0, Math.min(255, Math.round(c[0] * 255)))
      return { r: v, g: v, b: v }
    })
  }
  const paletteOklab = palette.map((c) => c.oklab)
  return centroids.map((c) => {
    const idx = nearestPaletteIndex(c, paletteOklab)
    const [r, g, b] = palette[idx].rgb
    return { r, g, b }
  })
}

/**
 * Build a flat RGBA buffer where every pixel carries its cluster's mean
 * source colour — the colour-reduced image fed to vtracer. Mirrors the
 * server feeding vtracer its median-cut-quantised image: distinct-per-cluster
 * flat colours so vtracer carves out a few clean regions, not thousands.
 *
 * Mean RGB is computed from the (blurred) source pixels, so a region's fill
 * is representative of its cluster and lands on a sensible Munsell chip when
 * the path fills are snapped after tracing.
 */
export function quantizedRgbaFromClusters(args: {
  image: PreviewImage
  assignments: Uint16Array
  clusterCount: number
}): Uint8ClampedArray {
  const { image, assignments, clusterCount } = args
  const { width, height, rgba } = image
  const n = width * height
  const sumR = new Float64Array(clusterCount)
  const sumG = new Float64Array(clusterCount)
  const sumB = new Float64Array(clusterCount)
  const count = new Uint32Array(clusterCount)
  for (let i = 0; i < n; i += 1) {
    const c = assignments[i]
    const o = i * 4
    sumR[c] += rgba[o]
    sumG[c] += rgba[o + 1]
    sumB[c] += rgba[o + 2]
    count[c] += 1
  }
  const meanR = new Uint8ClampedArray(clusterCount)
  const meanG = new Uint8ClampedArray(clusterCount)
  const meanB = new Uint8ClampedArray(clusterCount)
  for (let c = 0; c < clusterCount; c += 1) {
    const k = count[c] || 1
    meanR[c] = Math.round(sumR[c] / k)
    meanG[c] = Math.round(sumG[c] / k)
    meanB[c] = Math.round(sumB[c] / k)
  }
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    const c = assignments[i]
    const o = i * 4
    out[o] = meanR[c]
    out[o + 1] = meanG[c]
    out[o + 2] = meanB[c]
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

/** mulberry32 PRNG — small, fast, deterministic. Same seed → same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
