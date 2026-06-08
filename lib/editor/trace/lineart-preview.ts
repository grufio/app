/**
 * Client-side render helpers for the Line Art preview dialog.
 *
 * Approximates the server's vtracer + palette-snap output: posterize the
 * source into `num_colors` clusters via K-means in OKLab, then snap each
 * cluster's centroid to the nearest Munsell chip and paint a flat
 * region. Sobel-style outline pass is optional (`line_thickness > 0`).
 *
 * Not pixel-perfect to vtracer (which traces vector paths after its own
 * median-cut quantisation). Good enough for "see what the colours and
 * region shapes will look like" — the authoritative SVG comes from the
 * server on Apply.
 *
 * Pipeline is decomposed so React callers can memoize each stage against
 * its own deps — Gaussian blur re-runs on `blur_amount`, K-means on
 * `num_colors` and the blurred buffer, palette-snap on `color_mode`, the
 * paint step on `line_thickness`.
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
 * Paint the quantised image onto `target`: every pixel is the snapped
 * centroid colour of its cluster. When `lineThickness > 0`, cluster
 * boundaries get a black 1-px overlay (no-op for sub-pixel thickness —
 * the canvas is downscaled, so the boundary stays a clean 1px line).
 *
 * Caller owns `target.width` / `target.height` via JSX props; this
 * function only paints into the existing 2D context.
 */
export function paintQuantizedToCanvas(args: {
  target: HTMLCanvasElement
  width: number
  height: number
  assignments: Uint16Array
  snappedCentroids: ReadonlyArray<SnappedCentroid>
  lineThickness: number
}): void {
  const { target, width, height, assignments, snappedCentroids, lineThickness } = args
  if (width <= 0 || height <= 0 || snappedCentroids.length === 0) return
  const ctx = target.getContext("2d")
  if (!ctx) return

  const out = ctx.createImageData(width, height)
  for (let i = 0; i < assignments.length; i += 1) {
    const chip = snappedCentroids[assignments[i]]
    const o = i * 4
    out.data[o] = chip.r
    out.data[o + 1] = chip.g
    out.data[o + 2] = chip.b
    out.data[o + 3] = 255
  }

  if (lineThickness > 0) {
    // Mark every pixel whose right or down neighbour belongs to a different
    // cluster — that's a boundary. Black overlay.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x
        const here = assignments[idx]
        const right = x + 1 < width ? assignments[idx + 1] : here
        const down = y + 1 < height ? assignments[idx + width] : here
        if (here !== right || here !== down) {
          const o = idx * 4
          out.data[o] = 0
          out.data[o + 1] = 0
          out.data[o + 2] = 0
        }
      }
    }
  }

  ctx.putImageData(out, 0, 0)
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
