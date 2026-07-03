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
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2 })
    expect(svg.match(/<rect /g) ?? []).toHaveLength(4)
    expect(svg).toContain('<rect x="0" y="0" width="1" height="1" fill="#ff0000"/>')
    expect(svg).toContain('<rect x="1" y="0" width="1" height="1" fill="#00ff00"/>')
    expect(svg).toContain('<rect x="0" y="1" width="1" height="1" fill="#101010"/>')
    // padStart: rgb(5,5,5) → "#050505", not "#555".
    expect(svg).toContain('<rect x="1" y="1" width="1" height="1" fill="#050505"/>')
  })

  it("uses cell-unit viewBox + preserveAspectRatio none (stretches to the display box)", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2 })
    expect(svg).toContain('viewBox="0 0 2 2"')
    expect(svg).toContain('preserveAspectRatio="none"')
  })

  it("grid is a razor-sharp non-scaling hairline; colour rects carry no shape-rendering", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2 })
    expect(svg).toMatch(/<path [^>]*vector-effect="non-scaling-stroke"/)
    expect(svg).toMatch(/<path [^>]*shape-rendering="crispEdges"/)
    // crispEdges on adjacent rects would risk hairline seams → none on rects.
    expect(svg).not.toMatch(/<rect [^>]*shape-rendering/)
  })

  it("cells + grid live in ONE coordinate space (grid line i sits on cell i's edge)", () => {
    const svg = buildPixelateCellsSvg({ cells, cellsX: 2, cellsY: 2 })
    // Cell cx=1's rect is at x="1"; the grid has a vertical exactly there.
    expect(svg).toContain('x="1"')
    expect(svg).toContain("M1 0V2")
    // Full boundary set 0..cellsX (vertical) and 0..cellsY (horizontal).
    expect(svg).toContain("M0 0V2")
    expect(svg).toContain("M2 0V2")
    expect(svg).toContain("M0 0H2")
    expect(svg).toContain("M0 2H2")
  })
})
