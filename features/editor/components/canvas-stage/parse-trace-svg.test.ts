import { describe, expect, it } from "vitest"

import { parseTraceSvg } from "./parse-trace-svg"

const NUMERATE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1514" height="914" viewBox="0 0 1514 914">
  <rect width="1514" height="914" fill="white"/>
  <g id="colors" transform="scale(1.009333 1.015556)">
    <path d="M 0 0 L 50 0 L 50 30 Z" fill="#ff0000" transform="translate(0 0)"/>
    <path d="M 50 0 L 100 0 L 100 30 Z" fill="#00ff00"/>
  </g>
  <g id="grid">
    <line x1="0.0000" y1="0" x2="0.0000" y2="914" stroke="black" stroke-width="1" />
  </g>
</svg>`

const LINEART_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <rect width="500" height="500" fill="white"/>
  <g id="regions">
    <path d="M 0 0 L 100 0 L 100 100 Z" fill="#abcdef" stroke="black" stroke-width="2"/>
  </g>
</svg>`

describe("parseTraceSvg", () => {
  it("extracts numerate paths under #colors with the group transform", () => {
    const out = parseTraceSvg(NUMERATE_SVG)
    expect(out).not.toBeNull()
    expect(out!.viewBox).toBe("0 0 1514 914")
    expect(out!.width).toBe(1514)
    expect(out!.height).toBe(914)
    expect(out!.groupTransform).toBe("scale(1.009333 1.015556)")
    expect(out!.paths).toHaveLength(2)
    expect(out!.paths[0].fill).toBe("#ff0000")
    expect(out!.paths[0].transform).toBe("translate(0 0)")
    expect(out!.paths[1].fill).toBe("#00ff00")
    expect(out!.paths[1].transform).toBeNull()
  })

  it("extracts lineart paths under #regions (no group transform)", () => {
    const out = parseTraceSvg(LINEART_SVG)
    expect(out).not.toBeNull()
    expect(out!.groupTransform).toBeNull()
    expect(out!.paths).toHaveLength(1)
    expect(out!.paths[0].fill).toBe("#abcdef")
    expect(out!.detectedStrokeWidth).toBe(2)
  })

  it("falls back to stroke-width 1 when none detected", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="colors"><path d="M 0 0" fill="#fff"/></g></svg>`
    const out = parseTraceSvg(svg)
    expect(out!.detectedStrokeWidth).toBe(1)
  })

  it("returns null when no <svg> root", () => {
    expect(parseTraceSvg("<html><body/></html>")).toBeNull()
  })

  it("ignores paths outside the regions group", () => {
    const svg = `<svg viewBox="0 0 10 10"><g id="colors"><path d="M 0 0" fill="#aaa"/></g><g id="grid"><path d="M 0 5" fill="#000"/></g></svg>`
    const out = parseTraceSvg(svg)
    expect(out!.paths).toHaveLength(1)
    expect(out!.paths[0].fill).toBe("#aaa")
  })
})
