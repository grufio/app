/**
 * Watertight shared-arc boundary smoothing for the linerate preview — a client
 * port of the server back half (`filter-service/app/linerate.py`: `build_arcs`,
 * `smooth_arc`, `assemble_faces`).
 *
 * The earlier preview smoothed each region's contour INDEPENDENTLY, so a shared
 * boundary got two slightly different curves → gaps/holes, and the image frame
 * bent. Here the boundary is a planar graph of ARCS between junctions; each arc
 * is smoothed ONCE and shared by both neighbouring regions, so faces tile exactly
 * (no holes). Arcs along the image border keep straight (RDP collapses the
 * colinear run) and the four image corners are forced junctions → straight frame.
 *
 * Corners are encoded x-major as integers `c = x*(h+1) + y` (never [x,y] arrays —
 * those can't be Map/Set keys), matching the server's (x,y) tuple ordering.
 */
import { chaikinClosed, chaikinOpen, rdpOpen } from "./contour-trace"

export type Arc = {
  /** Junction→junction corner path (int-encoded). Closed if first === last. */
  corners: number[]
  /** The two region labels the arc separates; -1 = outside the image. */
  labels: [number, number]
  /** Smoothed points [x,y] — filled by `smoothArc`, SHARED by both neighbours. */
  smooth: number[][]
}

export type ArcGraph = {
  arcs: Arc[]
  /** region label → indices of its bounding arcs. */
  regionArcs: Map<number, number[]>
  /** corner encoding stride (h+1) so callers can decode. */
  cornerStride: number
}

/** Boundary as a shared-arc planar graph on the pixel-corner lattice. */
export function buildArcs(labels: Int32Array, w: number, h: number): ArcGraph {
  const S = h + 1 // corner stride (x-major)
  const N = (w + 1) * S // corner-count, for the unordered edge key
  const enc = (x: number, y: number): number => x * S + y
  const labelAt = (x: number, y: number): number =>
    x < 0 || x >= w || y < 0 || y >= h ? -1 : labels[y * w + x]

  const adj = new Map<number, number[]>()
  const edgeSide = new Map<number, [number, number]>()
  const edgeKey = (a: number, b: number): number => (a < b ? a * N + b : b * N + a)
  const add = (a: number, b: number, la: number, lb: number): void => {
    ;(adj.get(a) ?? adj.set(a, []).get(a)!).push(b)
    ;(adj.get(b) ?? adj.set(b, []).get(b)!).push(a)
    edgeSide.set(edgeKey(a, b), [la, lb])
  }

  // Horizontal cracks corner(x,y)-(x+1,y): pixel above (x,y-1) vs below (x,y).
  for (let y = 0; y <= h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const la = labelAt(x, y - 1)
      const lb = labelAt(x, y)
      if (la !== lb) add(enc(x, y), enc(x + 1, y), la, lb)
    }
  }
  // Vertical cracks corner(x,y)-(x,y+1): pixel left (x-1,y) vs right (x,y).
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x <= w; x += 1) {
      const la = labelAt(x - 1, y)
      const lb = labelAt(x, y)
      if (la !== lb) add(enc(x, y), enc(x, y + 1), la, lb)
    }
  }

  const isJunction = new Map<number, boolean>()
  for (const [c, ns] of adj) isJunction.set(c, ns.length !== 2)
  for (const c of [enc(0, 0), enc(w, 0), enc(0, h), enc(w, h)]) {
    if (isJunction.has(c)) isJunction.set(c, true) // keep image corners square
  }
  const junctionOf = (c: number): boolean => isJunction.get(c) ?? true // absent ⇒ stop

  const visited = new Set<number>()
  const trace = (start: number, first: number): Arc => {
    const corners = [start, first]
    visited.add(edgeKey(start, first))
    let cur = first
    while (!junctionOf(cur)) {
      let nxt: number | undefined
      for (const n of adj.get(cur) ?? []) {
        if (!visited.has(edgeKey(cur, n))) {
          nxt = n
          break
        }
      }
      if (nxt === undefined) break
      visited.add(edgeKey(cur, nxt))
      corners.push(nxt)
      cur = nxt
    }
    const [la, lb] = edgeSide.get(edgeKey(corners[0], corners[1]))!
    return { corners, labels: [la, lb], smooth: [] }
  }

  const arcs: Arc[] = []
  for (const [j, isj] of isJunction) {
    if (isj) for (const n of adj.get(j) ?? []) if (!visited.has(edgeKey(j, n))) arcs.push(trace(j, n))
  }
  for (const [c, ns] of adj) {
    for (const n of ns) if (!visited.has(edgeKey(c, n))) arcs.push(trace(c, n)) // pure loops
  }

  const regionArcs = new Map<number, number[]>()
  arcs.forEach((arc, i) => {
    for (const lb of arc.labels) {
      if (lb >= 0) (regionArcs.get(lb) ?? regionArcs.set(lb, []).get(lb)!).push(i)
    }
  })
  return { arcs, regionArcs, cornerStride: S }
}

/**
 * Smooth one arc's corners into [x,y] points. Open arcs (junction endpoints):
 * RDP then endpoint-pinned Chaikin. Closed arcs (pure loops): Chaikin only, no
 * RDP (mirrors the server). The result is direction-symmetric — reversing the
 * input yields the reversed output — so both neighbours of a shared arc get the
 * IDENTICAL polyline → watertight.
 */
export function smoothArc(corners: number[], cornerStride: number, eps: number, iters: number): number[][] {
  const S = cornerStride
  const pts = corners.map((c) => [Math.floor(c / S), c % S])
  if (corners[0] === corners[corners.length - 1]) {
    return chaikinClosed(pts.slice(0, -1), iters) // drop duplicate closing corner
  }
  return chaikinOpen(rdpOpen(pts, eps), iters)
}

/**
 * Walk a region's arcs into closed loops using the SHARED smoothed points. A
 * region enclosing another yields multiple loops (outer + holes) — fill them with
 * the evenodd rule. Uses a corner→arcs index for O(degree) next-arc lookup
 * (not O(arcs²)). Port of `assemble_faces`.
 */
export function assembleFaces(arcs: Arc[], regionArcs: Map<number, number[]>, label: number): number[][][] {
  const idxs = regionArcs.get(label) ?? []
  const ends = new Map<number, number[]>()
  const loops: number[][][] = []
  const unused = new Set(idxs)

  for (const i of idxs) {
    const c = arcs[i].corners
    if (c[0] === c[c.length - 1]) continue // closed loop, handled below
    ;(ends.get(c[0]) ?? ends.set(c[0], []).get(c[0])!).push(i)
    ;(ends.get(c[c.length - 1]) ?? ends.set(c[c.length - 1], []).get(c[c.length - 1])!).push(i)
  }
  for (const i of idxs) {
    const c = arcs[i].corners
    if (c[0] === c[c.length - 1] && unused.has(i)) {
      unused.delete(i)
      loops.push(arcs[i].smooth.slice())
    }
  }
  while (unused.size > 0) {
    const i = unused.values().next().value as number
    unused.delete(i)
    const start = arcs[i].corners[0]
    let cur = arcs[i].corners[arcs[i].corners.length - 1]
    const pts = arcs[i].smooth.slice()
    while (cur !== start) {
      let nxt = -1
      let rev = false
      for (const j of ends.get(cur) ?? []) {
        if (!unused.has(j)) continue
        const a = arcs[j]
        if (a.corners[0] === cur) {
          nxt = j
          rev = false
          break
        }
        if (a.corners[a.corners.length - 1] === cur) {
          nxt = j
          rev = true
          break
        }
      }
      if (nxt === -1) break
      unused.delete(nxt)
      const a = arcs[nxt]
      const seg = rev ? a.smooth.slice().reverse() : a.smooth.slice()
      for (let k = 1; k < seg.length; k += 1) pts.push(seg[k]) // drop shared endpoint
      cur = rev ? a.corners[0] : a.corners[a.corners.length - 1]
    }
    loops.push(pts)
  }
  return loops
}
