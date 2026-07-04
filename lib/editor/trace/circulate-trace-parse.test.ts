import { describe, expect, it } from "vitest"

import { parseCirculateTraceSvg } from "./circulate-trace-parse"

// Mirrors the Python circulate output: viewBox in crop px, <g id="cells"> with
// nested <g data-cell> (outer + optional inner filled ellipses, optional contour
// stroke), <g id="frames"> outline ellipses, optional <g id="numbers">.
const CIRCULATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
  <g id="cells">
    <g data-cell="0,0"><ellipse cx="10.0000" cy="8.0000" rx="8.0000" ry="6.0000" fill="#ff0000"/></g>
    <g data-cell="1,0"><ellipse cx="30.0000" cy="8.0000" rx="8.0000" ry="6.0000" fill="#00ff00" stroke="black" stroke-width="2.0000"/><ellipse cx="30.0000" cy="8.0000" rx="4.0000" ry="3.0000" fill="#0000ff" stroke="black" stroke-width="2.0000"/></g>
  </g>
  <g id="frames">
    <ellipse cx="10.0000" cy="8.0000" rx="8.0000" ry="6.0000" fill="none" stroke="black" stroke-width="1"/>
    <ellipse cx="30.0000" cy="8.0000" rx="8.0000" ry="6.0000" fill="none" stroke="black" stroke-width="1"/>
  </g>
  <g id="numbers">
    <text x="10" y="8">3</text>
  </g>
</svg>`

// Pixelate (has <g id="grid">, no <g id="frames">) — the circulate overlay must stay inert.
const PIXELATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
  <g id="colors"><rect x="0" y="0" width="1" height="1" fill="#ff0000"/></g>
  <g id="grid"><line x1="50" y1="0" x2="50" y2="80" stroke="black" stroke-width="1.0"/></g>
</svg>`

describe("parseCirculateTraceSvg", () => {
  it("returns null for non-circulate SVG (no <g id=frames>) or empty", () => {
    expect(parseCirculateTraceSvg(PIXELATE_SVG)).toBeNull()
    expect(parseCirculateTraceSvg("")).toBeNull()
    expect(parseCirculateTraceSvg(null)).toBeNull()
  })

  it("parses the viewBox extent (crop px)", () => {
    const p = parseCirculateTraceSvg(CIRCULATE_SVG)!
    expect(p.viewBoxW).toBe(100)
    expect(p.viewBoxH).toBe(80)
  })

  it("collects filled cell ellipses (outer + inner), through nested <g data-cell>", () => {
    const p = parseCirculateTraceSvg(CIRCULATE_SVG)!
    // 3 filled ellipses: cell(0,0) outer, cell(1,0) outer + inner.
    expect(p.cells).toHaveLength(3)
    expect(p.cells[0]).toMatchObject({ cx: 10, cy: 8, rx: 8, ry: 6, fill: "#ff0000", contour: 0 })
    expect(p.cells[1]).toMatchObject({ cx: 30, cy: 8, rx: 8, ry: 6, fill: "#00ff00" })
    expect(p.cells[2]).toMatchObject({ cx: 30, cy: 8, rx: 4, ry: 3, fill: "#0000ff" })
  })

  it("captures the optional per-cell contour stroke width", () => {
    const p = parseCirculateTraceSvg(CIRCULATE_SVG)!
    expect(p.cells[0].contour).toBe(0) // no stroke on the first cell
    expect(p.cells[1].contour).toBe(2) // stroke-width="2"
    expect(p.cells[2].contour).toBe(2)
  })

  it("collects frame outlines (fill=none) separately", () => {
    const p = parseCirculateTraceSvg(CIRCULATE_SVG)!
    expect(p.frames).toHaveLength(2)
    expect(p.frames[0]).toEqual({ cx: 10, cy: 8, rx: 8, ry: 6 })
    expect(p.frames[1]).toEqual({ cx: 30, cy: 8, rx: 8, ry: 6 })
  })

  it("does not pick up the numbers group", () => {
    const p = parseCirculateTraceSvg(CIRCULATE_SVG)!
    // Only ellipses counted; the <text> in numbers is ignored.
    expect(p.cells).toHaveLength(3)
    expect(p.frames).toHaveLength(2)
  })
})
