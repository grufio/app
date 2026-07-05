import { describe, expect, it } from "vitest"

import { prepareTraceSvg } from "./prepare-trace-svg"

// Pixelate: <rect> cells + <g id="grid"> + <g id="numbers">. Cells + grid render
// on the Konva canvas, so prepareTraceSvg strips them and keeps only the numbers.
const PIXELATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
  <g id="colors" transform="scale(50 40)">
    <rect x="0" y="0" width="1" height="1" fill="#ff0000"/>
    <rect x="1" y="0" width="1" height="1" fill="#00ff00"/>
  </g>
  <g id="grid">
    <line x1="50" y1="0" x2="50" y2="80" stroke="black" stroke-width="1.0" />
  </g>
  <g id="numbers">
    <text x="25" y="20">7</text>
  </g>
</svg>`

// Circulate: nested <g data-cell> filled ellipses + <g id="frames"> outlines +
// <g id="numbers">. Cells + frames render on Konva, so prepareTraceSvg strips them
// (nesting-safe range strip) and keeps only the numbers.
const CIRCULATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
  <g id="cells">
    <g data-cell="0,0"><ellipse cx="10" cy="8" rx="8" ry="6" fill="#ff0000"/></g>
    <g data-cell="1,0"><ellipse cx="30" cy="8" rx="8" ry="6" fill="#00ff00"/></g>
  </g>
  <g id="frames">
    <ellipse cx="10" cy="8" rx="8" ry="6" fill="none" stroke="black" stroke-width="1"/>
  </g>
  <g id="numbers">
    <text x="10" y="8">3</text>
  </g>
</svg>`

// Lineart: <path> regions, no grid — nothing is stripped; paths get annotated.
const LINEART_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <g id="regions">
    <path d="M 0 0 L 100 0 L 100 100 Z" fill="#abcdef" stroke="black" stroke-width="2"/>
    <path d="M 100 0 L 200 0 L 200 100 Z" fill="#123456"/>
  </g>
</svg>`

describe("prepareTraceSvg", () => {
  it("strips XML decl + intrinsic width/height and adds 100% sizing", () => {
    const out = prepareTraceSvg(PIXELATE_SVG)
    expect(out).not.toBeNull()
    expect(out!.html).not.toMatch(/<\?xml/)
    expect(out!.html).toMatch(/<svg[^>]*\bwidth="100%"[^>]*\bheight="100%"/)
    expect(out!.html).toMatch(/preserveAspectRatio="none"/)
  })

  it("preserves the viewBox so the overlay maps the same coordinate space", () => {
    const out = prepareTraceSvg(PIXELATE_SVG)!
    expect(out.html).toMatch(/viewBox="0 0 100 80"/)
  })

  it("pixelate: strips cells + grid (rendered on Konva), keeps the numbers group", () => {
    const out = prepareTraceSvg(PIXELATE_SVG)!
    expect(out.html).not.toMatch(/<g id="colors"/)
    expect(out.html).not.toMatch(/<g id="grid"/)
    expect(out.html).not.toMatch(/<rect/)
    expect(out.html).not.toMatch(/<line/)
    expect(out.html).toMatch(/<g id="numbers"/)
    expect(out.html).toMatch(/>7</)
  })

  it("circulate: strips cells + frames (rendered on Konva), keeps the numbers group", () => {
    const out = prepareTraceSvg(CIRCULATE_SVG)!
    expect(out.html).not.toMatch(/<g id="cells"/)
    expect(out.html).not.toMatch(/<g id="frames"/)
    expect(out.html).not.toMatch(/<ellipse/)
    expect(out.html).not.toMatch(/data-cell/)
    expect(out.html).toMatch(/<g id="numbers"/)
    expect(out.html).toMatch(/>3</)
    expect(out.html).toMatch(/<\/svg>/)
  })

  it("circulate without a numbers group: strips cells + frames up to </svg>", () => {
    const noNumbers = CIRCULATE_SVG.replace(/\s*<g id="numbers">[\s\S]*?<\/g>/, "")
    const out = prepareTraceSvg(noNumbers)!
    expect(out.html).not.toMatch(/<ellipse/)
    expect(out.html).not.toMatch(/<g id="cells"/)
    expect(out.html).not.toMatch(/<g id="frames"/)
    expect(out.html).toMatch(/<\/svg>/)
  })

  it("lineart: annotates every <path> with data-trace-region + data-fill; strips nothing", () => {
    const out = prepareTraceSvg(LINEART_SVG)!
    const matches = out.html.match(/data-trace-region=""/g) ?? []
    expect(matches).toHaveLength(2)
    expect(out.html).toMatch(/data-fill="#abcdef"/)
    expect(out.html).toMatch(/data-fill="#123456"/)
    // no grid → nothing stripped; region group + authored stroke intact.
    expect(out.html).toMatch(/<g id="regions"/)
    expect(out.html).toMatch(/stroke="black"/)
    expect(out.html).toMatch(/stroke-width="2"/)
  })

  it("keeps the original RGB fill on every lineart <path>", () => {
    const out = prepareTraceSvg(LINEART_SVG)!
    expect(out.html).toMatch(/<path[^>]*fill="#abcdef"[^>]*data-trace-region/)
    expect(out.html).toMatch(/<path[^>]*fill="#123456"[^>]*data-trace-region/)
  })

  it("returns null when no <svg> root", () => {
    expect(prepareTraceSvg("<html><body/></html>")).toBeNull()
  })
})
