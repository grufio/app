/**
 * Client-side pipeline helpers for the LINERATE (paint-by-numbers) preview.
 * Line Art reuses this same preview (it is the linerate model pinned to full
 * palette + finest detail) via `lineartToLineratePreviewParams`.
 *
 * Linerate is a *labelling* problem: colour == region, and the `detail` slider
 * drives the region COUNT via a facet min-area. This module is a fast, approximate
 * client mirror of the server's facet model
 * (`filter-service/app/linerate.py`): snap pixels to palette chips → connected
 * components → merge every facet below `min_area` into its most-similar-coloured
 * (strictly-larger) neighbour → final re-CC → flat fill + 1px outlines.
 *
 * It is deliberately NOT byte-parity with the server (L0 flatten vs numpy FFT,
 * coverage/PAM selection, a downscaled buffer). The faithfulness we DO keep
 * is that region granularity tracks the `detail`/`min_paintable_mm` dials — so the
 * preview answers "roughly how many regions will I get", which is the whole point
 * of having a preview. No per-region numbers (server-only).
 */
import { nearestPaletteIndex, type Oklab } from "@/lib/color/oklab"

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

// Mirror of the server `_detail_to_min_area` constants
// (`filter-service/app/linerate.py`). A python-parity test asserts these stay
// equal to the Python source, so a server-side change fails the client build.
export const LINERATE_DETAIL_MIN_FRAC = 0.0001 // min facet area fraction at detail=1
export const LINERATE_DETAIL_MAX_FRAC = 0.003 // ... at detail=0
const MERGE_ROUNDS = 12 // preview cap (server uses 40 as a safety cap)

/**
 * Port of `_detail_to_min_area` (geometric). Region count scales like 1/frac, so
 * `frac` is interpolated geometrically across the slider. `previewPx` is the total
 * pixel count of the work buffer (`width*height`); `minRadiusPx` is the paintability
 * floor's inscribed-circle radius in preview pixels. Returns the min facet area.
 */
export function detailToMinArea(detail: number, previewPx: number, minRadiusPx: number): number {
  const d = Math.max(0, Math.min(1, detail))
  const frac = LINERATE_DETAIL_MAX_FRAC * (LINERATE_DETAIL_MIN_FRAC / LINERATE_DETAIL_MAX_FRAC) ** d
  const floor = Math.PI * minRadiusPx * minRadiusPx
  return Math.max(floor, frac * previewPx)
}

/**
 * Nearest palette chip index for each K-means centroid. Two centroids can snap to
 * the SAME chip — connected components must run on the CHIP index (not the cluster
 * index), or two same-colour adjacent clusters would keep a false boundary. Mirrors
 * the server snapping pixels to selected paints BEFORE labelling. With an empty
 * palette every cluster is its own paint (tests / load race).
 */
export function chipPerCluster(centroids: ReadonlyArray<Oklab>, palette: ReadonlyArray<PaletteChip>): Int32Array {
  const chip = new Int32Array(centroids.length)
  if (palette.length === 0) {
    for (let c = 0; c < centroids.length; c += 1) chip[c] = c
    return chip
  }
  const paletteOklab = palette.map((c) => c.oklab)
  for (let c = 0; c < centroids.length; c += 1) chip[c] = nearestPaletteIndex(centroids[c], paletteOklab)
  return chip
}

export type ConnectedComponents = {
  /** Compact region id per pixel, row-major (`y*width + x`). */
  labels: Int32Array
  regionCount: number
  /** Paint (chip) index per region. */
  regionPaint: Int32Array
  /** Pixel area per region. */
  regionArea: Int32Array
}

/**
 * 4-connected components over a per-pixel paint (chip) map. Iterative union-find
 * with path compression — never recursive (110k+ px would blow the JS stack).
 * `labels` is Int32 (region ids can exceed 65535 on noisy input). Mirrors
 * `_labels_from_paint_map`.
 */
export function connectedComponents(paint: Int32Array, w: number, h: number): ConnectedComponents {
  const n = w * h
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i += 1) parent[i] = i

  const find = (start: number): number => {
    let root = start
    while (parent[root] !== root) root = parent[root]
    let node = start
    while (parent[node] !== root) {
      const next = parent[node]
      parent[node] = root
      node = next
    }
    return root
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb < ra ? ra : rb] = rb < ra ? rb : ra
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const p = paint[i]
      if (x + 1 < w && paint[i + 1] === p) union(i, i + 1)
      if (y + 1 < h && paint[i + w] === p) union(i, i + w)
    }
  }

  const labels = new Int32Array(n)
  const rootToId = new Map<number, number>()
  let regionCount = 0
  for (let i = 0; i < n; i += 1) {
    const r = find(i)
    let id = rootToId.get(r)
    if (id === undefined) {
      id = regionCount
      regionCount += 1
      rootToId.set(r, id)
    }
    labels[i] = id
  }

  const regionPaint = new Int32Array(regionCount)
  const regionArea = new Int32Array(regionCount)
  for (let i = 0; i < n; i += 1) {
    const l = labels[i]
    regionPaint[l] = paint[i]
    regionArea[l] += 1
  }
  return { labels, regionCount, regionPaint, regionArea }
}

export type SegmentedRegions = {
  /** Compact region id per pixel. */
  labels: Int32Array
  regionCount: number
  /** Palette chip index per region (adjacent regions always differ after re-CC). */
  regionChip: Int32Array
}

/**
 * 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher 2012):
 * the lower envelope of the parabolas rooted at each sample of cost `f`, i.e.
 * `d[q] = min_p ((q - p)^2 + f[p])`. O(n). Scratch arrays `v`/`z` are reused
 * across calls to avoid per-row allocation.
 */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k -= 1
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k += 1
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/**
 * Per-region paintability-by-WIDTH test — client mirror of the server's
 * `_facet_has_width`. A region is paintable only if it CONTAINS an inscribed disk
 * of radius `minRadiusPx` — some interior pixel at least that far from the region
 * boundary. Area alone doesn't imply width: a long thin sliver clears `minArea`
 * yet is too narrow to paint. Boundary = a pixel whose 4-neighbour is a different
 * region (or the image edge); squared-EDT to it, then flag every region owning a
 * pixel with dist ≥ minRadiusPx. Returns Uint8Array(regionCount): 1 = wide enough.
 */
function regionWidthOk(
  labels: Int32Array,
  w: number,
  h: number,
  regionCount: number,
  minRadiusPx: number,
): Uint8Array {
  const n = w * h
  const INF = 1e20
  const f = new Float64Array(n)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const l = labels[i]
      const boundary =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        labels[i - 1] !== l || labels[i + 1] !== l ||
        labels[i - w] !== l || labels[i + w] !== l
      f[i] = boundary ? 0 : INF
    }
  }
  const maxWH = Math.max(w, h)
  const line = new Float64Array(maxWH)
  const dline = new Float64Array(maxWH)
  const v = new Int32Array(maxWH)
  const z = new Float64Array(maxWH + 1)
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) line[y] = f[y * w + x]
    edt1d(line, h, dline, v, z)
    for (let y = 0; y < h; y += 1) f[y * w + x] = dline[y]
  }
  for (let y = 0; y < h; y += 1) {
    const base = y * w
    for (let x = 0; x < w; x += 1) line[x] = f[base + x]
    edt1d(line, w, dline, v, z)
    for (let x = 0; x < w; x += 1) f[base + x] = dline[x]
  }
  const r2 = minRadiusPx * minRadiusPx
  const ok = new Uint8Array(regionCount)
  for (let i = 0; i < n; i += 1) {
    if (f[i] >= r2) ok[labels[i]] = 1
  }
  return ok
}

/**
 * Full linerate segmentation approximation: connected components → merge facets
 * below `minArea` — or, when `minRadiusPx > 0`, narrower than that inscribed-disk
 * radius (a thin sliver, however long) — into their most-similar-coloured
 * STRICTLY-LARGER neighbour (ties → smaller id) → final re-CC. The strictly-larger
 * orientation makes the merge target graph a forest (acyclic), which prevents two
 * mutually-nearest small facets from oscillating forever — the same trick the
 * server's `_facet_merge` uses. `chipOklab[chipIndex]` supplies each paint's
 * colour. `minRadiusPx` mirrors the server width gate (0 = area only).
 */
export function segmentRegions(
  paintMap: Int32Array,
  w: number,
  h: number,
  chipOklab: ReadonlyArray<Oklab>,
  minArea: number,
  minRadiusPx = 0,
): SegmentedRegions {
  const cc = connectedComponents(paintMap, w, h)
  const { labels } = cc
  let { regionCount, regionPaint, regionArea } = cc

  for (let round = 0; round < MERGE_ROUNDS; round += 1) {
    // Which facets still need merging this round: below the detail-driven area
    // floor OR — when a paintability width is set — too narrow to hold an inscribed
    // disk of `minRadiusPx` (a thin sliver). Recomputed per round (labels change).
    const widthOk = minRadiusPx > 0 ? regionWidthOk(labels, w, h, regionCount, minRadiusPx) : null
    const tooSmall = new Uint8Array(regionCount)
    let anySmall = false
    for (let r = 0; r < regionCount; r += 1) {
      if (regionArea[r] < minArea || (widthOk !== null && widthOk[r] === 0)) {
        tooSmall[r] = 1
        anySmall = true
      }
    }
    if (!anySmall) break

    // Adjacent-region neighbour sets (rebuilt each round — labels change).
    const neigh: Set<number>[] = new Array(regionCount)
    for (let r = 0; r < regionCount; r += 1) neigh[r] = new Set<number>()
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x
        const a = labels[i]
        if (x + 1 < w) {
          const b = labels[i + 1]
          if (a !== b) {
            neigh[a].add(b)
            neigh[b].add(a)
          }
        }
        if (y + 1 < h) {
          const b = labels[i + w]
          if (a !== b) {
            neigh[a].add(b)
            neigh[b].add(a)
          }
        }
      }
    }

    // Each small facet targets its most-similar STRICTLY-LARGER neighbour.
    const target = new Int32Array(regionCount)
    for (let r = 0; r < regionCount; r += 1) target[r] = r
    let merged = false
    for (let s = 0; s < regionCount; s += 1) {
      if (!tooSmall[s]) continue
      const sc = chipOklab[regionPaint[s]]
      let best = -1
      let bestD = Infinity
      for (const nb of neigh[s]) {
        const larger = regionArea[nb] > regionArea[s] || (regionArea[nb] === regionArea[s] && nb < s)
        if (!larger) continue
        const nc = chipOklab[regionPaint[nb]]
        const dl = sc[0] - nc[0]
        const da = sc[1] - nc[1]
        const db = sc[2] - nc[2]
        const d = dl * dl + da * da + db * db
        if (d < bestD) {
          bestD = d
          best = nb
        }
      }
      if (best >= 0) {
        target[s] = best
        merged = true
      }
    }
    if (!merged) break

    // Pointer-jump to resolve merge chains to their root (acyclic → converges).
    const jumps = Math.ceil(Math.log2(Math.max(2, regionCount))) + 1
    for (let j = 0; j < jumps; j += 1) {
      for (let r = 0; r < regionCount; r += 1) target[r] = target[target[r]]
    }

    // Compact surviving roots, relabel pixels, recompute paint + area.
    const oldToNew = new Int32Array(regionCount).fill(-1)
    let nextId = 0
    for (let r = 0; r < regionCount; r += 1) {
      if (target[r] === r) {
        oldToNew[r] = nextId
        nextId += 1
      }
    }
    const newPaint = new Int32Array(nextId)
    for (let r = 0; r < regionCount; r += 1) {
      if (target[r] === r) newPaint[oldToNew[r]] = regionPaint[r]
    }
    const newArea = new Int32Array(nextId)
    for (let i = 0; i < labels.length; i += 1) {
      const id = oldToNew[target[labels[i]]]
      labels[i] = id
      newArea[id] += 1
    }
    regionCount = nextId
    regionPaint = newPaint
    regionArea = newArea
  }

  // Final re-CC on the merged paint map: coalesces adjacent same-chip facets so
  // neighbouring regions always differ in colour (mirrors the server's final
  // `_labels_from_paint_map`).
  const finalPaint = new Int32Array(w * h)
  for (let i = 0; i < finalPaint.length; i += 1) finalPaint[i] = regionPaint[labels[i]]
  const finalCc = connectedComponents(finalPaint, w, h)
  return { labels: finalCc.labels, regionCount: finalCc.regionCount, regionChip: finalCc.regionPaint }
}

/**
 * Paint each region flat with its chip RGB, then mark region boundaries black
 * (any pixel whose right or bottom neighbour is a different region). 1 buffer-px
 * outlines — with the pane's `imageRendering: pixelated` upscale they read as
 * crisp blocky lines (no SVG subpixel-straddle, no anti-alias). Returns RGBA.
 */
export function renderRegionsRgba(
  labels: Int32Array,
  regionChip: Int32Array,
  chipRgb: ReadonlyArray<readonly [number, number, number]>,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < labels.length; i += 1) {
    const rgb = chipRgb[regionChip[labels[i]]]
    const o = i * 4
    out[o] = rgb[0]
    out[o + 1] = rgb[1]
    out[o + 2] = rgb[2]
    out[o + 3] = 255
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const l = labels[i]
      if ((x + 1 < w && labels[i + 1] !== l) || (y + 1 < h && labels[i + w] !== l)) {
        const o = i * 4
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
      }
    }
  }
  return out
}
