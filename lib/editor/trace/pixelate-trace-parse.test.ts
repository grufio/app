import { describe, expect, it } from "vitest"

import { parsePixelateTraceSvg } from "./pixelate-trace-parse"

// Mirrors the Python pixelate output: viewBox in crop px, <g id="colors"> cell
// rects (cell-space, scaled group), <g id="grid"> lines (viewBox px), optional
// <g id="numbers">.
const PIXELATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
  <g id="colors" transform="scale(50.000000 40.000000)">
    <rect x="0" y="0" width="1" height="1" fill="#ff0000"/>
    <rect x="1" y="0" width="1" height="1" fill="#00ff00"/>
    <rect x="0" y="1" width="1" height="1" fill="#0000ff"/>
    <rect x="1" y="1" width="1" height="1" fill="#010203"/>
  </g>
  <g id="grid">
    <line x1="0.0000" y1="0" x2="0.0000" y2="80.0000" stroke="black" stroke-width="1.0" />
    <line x1="50.0000" y1="0" x2="50.0000" y2="80.0000" stroke="black" stroke-width="1.0" />
    <line x1="100.0000" y1="0" x2="100.0000" y2="80.0000" stroke="black" stroke-width="1.0" />
    <line x1="0" y1="0.0000" x2="100.0000" y2="0.0000" stroke="black" stroke-width="1.0" />
    <line x1="0" y1="40.0000" x2="100.0000" y2="40.0000" stroke="black" stroke-width="1.0" />
    <line x1="0" y1="80.0000" x2="100.0000" y2="80.0000" stroke="black" stroke-width="1.0" />
  </g>
  <g id="numbers">
    <text x="25" y="20">7</text>
  </g>
</svg>`

// Linerate: no <g id="grid"> — the Konva overlay must stay inert.
const LINERATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <g id="regions"><path d="M 0 0 L 100 0 L 100 100 Z" fill="#abcdef"/></g>
</svg>`

describe("parsePixelateTraceSvg", () => {
  it("returns null for non-pixelate SVG (no <g id=grid>)", () => {
    expect(parsePixelateTraceSvg(LINERATE_SVG)).toBeNull()
    expect(parsePixelateTraceSvg("")).toBeNull()
    expect(parsePixelateTraceSvg(null)).toBeNull()
  })

  it("parses the viewBox extent (crop px)", () => {
    const p = parsePixelateTraceSvg(PIXELATE_SVG)!
    expect(p.viewBoxW).toBe(100)
    expect(p.viewBoxH).toBe(80)
  })

  it("derives cellsX/cellsY from the max cell index", () => {
    const p = parsePixelateTraceSvg(PIXELATE_SVG)!
    expect(p.cellsX).toBe(2)
    expect(p.cellsY).toBe(2)
  })

  it("packs per-cell RGB row-major (cy*cellsX + cx)", () => {
    const p = parsePixelateTraceSvg(PIXELATE_SVG)!
    expect(p.cellRgb).toHaveLength(4)
    expect(p.cellRgb[0]).toBe(0xff0000) // (0,0)
    expect(p.cellRgb[1]).toBe(0x00ff00) // (1,0)
    expect(p.cellRgb[2]).toBe(0x0000ff) // (0,1)
    expect(p.cellRgb[3]).toBe(0x010203) // (1,1)
  })

  it("splits grid lines into vertical x and horizontal y positions (viewBox px)", () => {
    const p = parsePixelateTraceSvg(PIXELATE_SVG)!
    expect(p.gridXs).toEqual([0, 50, 100])
    expect(p.gridYs).toEqual([0, 40, 80])
  })

  it("does NOT pick up the numbers group as cells or lines", () => {
    const p = parsePixelateTraceSvg(PIXELATE_SVG)!
    // 4 cells only (the <text> in numbers is ignored), 3+3 grid lines.
    expect(p.cellRgb).toHaveLength(4)
    expect(p.gridXs.length + p.gridYs.length).toBe(6)
  })
})
