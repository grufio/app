import { describe, expect, it } from "vitest"

import { buildPixelateCellsSvg } from "./pixelate-preview"

describe("buildPixelateCellsSvg", () => {
  // 2×2 grid; colour index i = cy*cellsX + cx.
  const cells = {
    r: Uint8ClampedArray.from([255, 0, 16, 5]),
    g: Uint8ClampedArray.from([0, 255, 16, 5]),
    b: Uint8ClampedArray.from([0, 0, 16, 5]),
  }

  it("emits one <rect> per cell at (cx,cy) with 2-digit hex fill", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2, cropW: 100, cropH: 80 })
    expect(svg.match(/<rect /g) ?? []).toHaveLength(4)
    expect(svg).toContain('<rect x="0" y="0" width="1" height="1" fill="#ff0000"/>')
    expect(svg).toContain('<rect x="1" y="0" width="1" height="1" fill="#00ff00"/>')
    expect(svg).toContain('<rect x="0" y="1" width="1" height="1" fill="#101010"/>')
    // padStart: rgb(5,5,5) → "#050505", not "#555".
    expect(svg).toContain('<rect x="1" y="1" width="1" height="1" fill="#050505"/>')
  })

  it("uses a PIXEL-space viewBox (the crop px) + preserveAspectRatio none", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2, cropW: 100, cropH: 80 })
    // Mirrors the applied result's `viewBox="0 0 cropped_w_px cropped_h_px"`.
    expect(svg).toContain('viewBox="0 0 100 80"')
    expect(svg).toContain('preserveAspectRatio="none"')
  })

  it("scales the 1×1 cell rects into pixel space via a <g transform> (like the result)", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2, cropW: 100, cropH: 80 })
    // sx = cropW/cellsX = 50, sy = cropH/cellsY = 40.
    expect(svg).toContain('<g transform="scale(50 40)">')
  })

  it("grid is a plain <path> with inline stroke-width=1 — no CSS class, no vector-effect", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2, cropW: 100, cropH: 80 })
    // One pixel-unit stroke, inline, in pixel space → scales to a sub-pixel
    // hairline. No `.trace-grid`, no non-scaling-stroke (those pinned it to a
    // full hardware pixel = too thick).
    expect(svg).toMatch(/<path [^>]*stroke-width="1"/)
    expect(svg).not.toMatch(/class="trace-grid"/)
    expect(svg).not.toMatch(/vector-effect/)
    // colour rects carry no rendering hints (crispEdges → hairline seams).
    expect(svg).not.toMatch(/<rect [^>]*shape-rendering/)
  })

  it("cells + grid live in ONE pixel space (grid line i sits on cell i's scaled edge)", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2, cropW: 100, cropH: 80 })
    // Verticals at x = i*sx = 0, 50, 100 spanning the full pixel height (80).
    expect(svg).toContain("M0 0V80")
    expect(svg).toContain("M50 0V80")
    expect(svg).toContain("M100 0V80")
    // Horizontals at y = j*sy = 0, 40, 80 spanning the full pixel width (100).
    expect(svg).toContain("M0 0H100")
    expect(svg).toContain("M0 40H100")
    expect(svg).toContain("M0 80H100")
  })
})
