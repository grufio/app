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
 * Chaikin corner-cutting on a CLOSED loop — rounds the pixel staircase into a
 * smooth curve. Each iteration replaces every vertex with two points at 1/4 and
 * 3/4 along each edge (wrapping), same scheme the server uses for its arcs.
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
