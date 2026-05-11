import { describe, expect, it } from "vitest"

import { prepareTraceSvg } from "./prepare-trace-svg"

const NUMERATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1514" height="914" viewBox="0 0 1514 914">
  <rect width="1514" height="914" fill="white"/>
  <g id="colors" transform="scale(1.0093 1.0156)">
    <path d="M 0 0 L 50 0 L 50 30 Z" fill="#ff0000"/>
    <path d="M 50 0 L 100 0 L 100 30 Z" fill="#00ff00"/>
  </g>
  <g id="grid">
    <line x1="0" y1="0" x2="0" y2="914" stroke="black" stroke-width="2" />
  </g>
</svg>`

describe("prepareTraceSvg", () => {
  it("strips XML decl + width/height and adds 100% sizing", () => {
    const out = prepareTraceSvg(NUMERATE_SVG)
    expect(out).not.toBeNull()
    expect(out!.html).not.toMatch(/<\?xml/)
    expect(out!.html).not.toMatch(/<svg[^>]*\bwidth="1514"/)
    expect(out!.html).toMatch(/<svg[^>]*\bwidth="100%"/)
    expect(out!.html).toMatch(/<svg[^>]*\bheight="100%"/)
    expect(out!.html).toMatch(/preserveAspectRatio="none"/)
  })

  it("annotates every <path> with data-trace-region and data-fill", () => {
    const out = prepareTraceSvg(NUMERATE_SVG)!
    const matches = out.html.match(/data-trace-region=""/g) ?? []
    expect(matches).toHaveLength(2)
    expect(out.html).toMatch(/data-fill="#ff0000"/)
    expect(out.html).toMatch(/data-fill="#00ff00"/)
  })

  it("strips the white background <rect> so the underlying image can show through later", () => {
    const out = prepareTraceSvg(NUMERATE_SVG)!
    expect(out.html).not.toMatch(/<rect[^>]*fill="white"/)
  })

  it("keeps the original RGB fill on every <path>", () => {
    const out = prepareTraceSvg(NUMERATE_SVG)!
    // The fill attribute is unchanged so the rendered cell still
    // shows its detected RGB color at rest.
    expect(out.html).toMatch(/<path[^>]*fill="#ff0000"[^>]*data-trace-region/)
    expect(out.html).toMatch(/<path[^>]*fill="#00ff00"[^>]*data-trace-region/)
  })

  it("returns null when no <svg> root", () => {
    expect(prepareTraceSvg("<html><body/></html>")).toBeNull()
  })

  it("preserves the viewBox so the inline SVG maps the same coordinate space", () => {
    const out = prepareTraceSvg(NUMERATE_SVG)!
    expect(out.html).toMatch(/viewBox="0 0 1514 914"/)
  })
})
