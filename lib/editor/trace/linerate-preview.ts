/**
 * Client-side pipeline helpers for the LINERATE (paint-by-numbers) preview.
 *
 * Unlike the sibling LINEART preview (vtracer/spline outlines, `lineart-preview.ts`),
 * linerate is a *labelling* problem: colour == region, and the `detail` slider
 * drives the region COUNT via a facet min-area. This module is a fast, approximate
 * client mirror of the server's facet model
 * (`filter-service/app/linerate.py`): snap pixels to palette chips → connected
 * components → merge every facet below `min_area` into its most-similar-coloured
 * (strictly-larger) neighbour → final re-CC → flat fill + 1px outlines.
 *
 * It is deliberately NOT byte-parity with the server (Gaussian blur vs L0 flatten,
 * K-means vs coverage/PAM selection, a 384px buffer). The faithfulness we DO keep
 * is that region granularity tracks the `detail`/`min_paintable_mm` dials — so the
 * preview answers "roughly how many regions will I get", which is the whole point
 * of having a preview. No per-region numbers (server-only).
 */
import { nearestPaletteIndex, type Oklab } from "@/lib/color/oklab"

import type { PaletteChip } from "./trace-cell-colors"

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
 * Full linerate segmentation approximation: connected components → merge facets
 * below `minArea` into their most-similar-coloured STRICTLY-LARGER neighbour
 * (ties → smaller id) → final re-CC. The strictly-larger orientation makes the
 * merge target graph a forest (acyclic), which prevents two mutually-nearest
 * small facets from oscillating forever — the same trick the server's
 * `_facet_merge` uses. `chipOklab[chipIndex]` supplies each paint's colour.
 */
export function segmentRegions(
  paintMap: Int32Array,
  w: number,
  h: number,
  chipOklab: ReadonlyArray<Oklab>,
  minArea: number,
): SegmentedRegions {
  const cc = connectedComponents(paintMap, w, h)
  const { labels } = cc
  let { regionCount, regionPaint, regionArea } = cc

  for (let round = 0; round < MERGE_ROUNDS; round += 1) {
    let anySmall = false
    for (let r = 0; r < regionCount; r += 1) {
      if (regionArea[r] < minArea) {
        anySmall = true
        break
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
      if (regionArea[s] >= minArea) continue
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
