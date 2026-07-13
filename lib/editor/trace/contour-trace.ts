/**
 * Region-boundary contour tracing for the linerate preview's smooth outlines.
 *
 * The raster preview baked 1px outlines into a low-res buffer and upscaled it
 * pixelated → thick, staircase ("eckig") lines. Instead we trace each region's
 * boundary as a polygon on the pixel-corner lattice, Chaikin-smooth it, and
 * stroke it thin at display resolution — matching the Apply result's smooth
 * vector outlines (the server likewise smooths its boundary arcs with Chaikin).
 *
 * Every internal boundary is the OUTER contour of exactly one region (the border
 * of an enclosed region IS the hole border of its surrounder), so tracing only
 * outer contours and drawing fills largest-first covers the canvas and strokes
 * every seam once.
 */

export type RegionContour = {
  region: number
  /** Pixel area — draw fills largest-first so enclosed regions land on top. */
  area: number
  /** Closed boundary loop as [x, y] points on the corner lattice (0..w, 0..h). */
  loop: number[][]
}

/**
 * Trace the outer boundary contour of every region in a 4-connected label map.
 * Returns one contour per region, sorted by area DESCENDING (ready for painter's
 * -order fill). Boundary edges are oriented interior-on-left and chained into
 * closed loops on the corner lattice; the longest loop per region is its outer
 * contour.
 */
export function traceRegionContours(labels: Int32Array, w: number, h: number, regionCount: number): RegionContour[] {
  const stride = w + 1
  const key = (i: number, j: number): number => j * stride + i
  // Directed boundary edges per region: startCorner → endCorner.
  const edges: Map<number, number>[] = Array.from({ length: regionCount }, () => new Map<number, number>())
  const area = new Int32Array(regionCount)

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const r = labels[y * w + x]
      area[r] += 1
      const m = edges[r]
      // Interior-on-left orientation for each side whose neighbour differs.
      if (y === 0 || labels[(y - 1) * w + x] !== r) m.set(key(x + 1, y), key(x, y)) // up
      if (y === h - 1 || labels[(y + 1) * w + x] !== r) m.set(key(x, y + 1), key(x + 1, y + 1)) // down
      if (x === 0 || labels[y * w + x - 1] !== r) m.set(key(x, y), key(x, y + 1)) // left
      if (x === w - 1 || labels[y * w + x + 1] !== r) m.set(key(x + 1, y + 1), key(x + 1, y)) // right
    }
  }

  const out: RegionContour[] = []
  for (let r = 0; r < regionCount; r += 1) {
    const m = edges[r]
    let best: number[][] = []
    while (m.size > 0) {
      const start = m.keys().next().value as number
      const loop: number[][] = []
      let cur = start
      for (;;) {
        loop.push([cur % stride, (cur / stride) | 0])
        const nxt = m.get(cur)
        m.delete(cur)
        if (nxt === undefined || nxt === start) break
        cur = nxt
      }
      if (loop.length > best.length) best = loop
    }
    if (best.length > 0) out.push({ region: r, area: area[r], loop: best })
  }
  out.sort((a, b) => b.area - a.area)
  return out
}

/**
 * Mirror of the server `smoothness_to_params` (filter-service/app/linerate.py):
 * smoothness ∈ [0,1] → (rdp_eps, chaikin_iters). `eps` is in the server's 480px
 * work-pixel space; scale it to the preview's resolution at the call site so the
 * preview smooths the SAME amount the Apply result does. Driving this from the
 * Smoothness dial (instead of a hardcoded value) lets the user dial the outlines
 * sharper/smoother, and keeps preview ⇄ Apply consistent.
 */
export function smoothnessToParams(smoothness: number): { eps: number; iters: number } {
  const s = Math.max(0, Math.min(1, smoothness))
  return { eps: 0.5 + s * 2.0, iters: 2 + Math.round(s * 2) }
}

function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Ramer–Douglas–Peucker on an OPEN polyline. */
function rdpOpen(pts: number[][], eps: number): number[][] {
  if (pts.length < 3) return pts.slice()
  const a = pts[0]
  const b = pts[pts.length - 1]
  let idx = -1
  let max = 0
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = perpDist(pts[i], a, b)
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max > eps) {
    const left = rdpOpen(pts.slice(0, idx + 1), eps)
    const right = rdpOpen(pts.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [a, b]
}

/**
 * Simplify a CLOSED loop with RDP — collapses the pixel staircase into straight
 * segments BEFORE Chaikin (Chaikin alone only rounds each 1px step, leaving the
 * boundary visibly stepped). Mirrors the server's `smooth_arc` = RDP then Chaikin.
 * The loop is split at the point farthest from its start so both arcs simplify
 * as open polylines while staying closed.
 */
export function simplifyClosed(loop: number[][], eps: number): number[][] {
  const n = loop.length
  if (n < 4) return loop.slice()
  // Rotate to start at an extreme point (min y, then min x) — always a genuine
  // corner, so RDP won't pin a redundant mid-edge start vertex.
  let ext = 0
  for (let i = 1; i < n; i += 1) {
    if (loop[i][1] < loop[ext][1] || (loop[i][1] === loop[ext][1] && loop[i][0] < loop[ext][0])) ext = i
  }
  const rot = ext === 0 ? loop : loop.slice(ext).concat(loop.slice(0, ext))
  let far = 0
  let fd = -1
  for (let i = 1; i < n; i += 1) {
    const d = Math.hypot(rot[i][0] - rot[0][0], rot[i][1] - rot[0][1])
    if (d > fd) {
      fd = d
      far = i
    }
  }
  const arc1 = rot.slice(0, far + 1)
  const arc2 = rot.slice(far).concat([rot[0]])
  const s1 = rdpOpen(arc1, eps)
  const s2 = rdpOpen(arc2, eps)
  return s1.slice(0, -1).concat(s2.slice(0, -1))
}

/**
 * Chaikin corner-cutting on a CLOSED loop — rounds the (RDP-simplified) corners
 * into a smooth curve. Each iteration replaces every vertex with two points at
 * 1/4 and 3/4 along each edge (wrapping), same scheme the server uses for its arcs.
 */
export function chaikinClosed(loop: number[][], iters: number): number[][] {
  let pts = loop
  for (let it = 0; it < iters; it += 1) {
    const n = pts.length
    if (n < 3) break
    const next: number[][] = new Array(n * 2)
    for (let i = 0; i < n; i += 1) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      next[i * 2] = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]
      next[i * 2 + 1] = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]
    }
    pts = next
  }
  return pts
}
