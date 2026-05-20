import { describe, expect, it } from "vitest"

import { padSvgToFullImage } from "./pixelate-svg-pad"

/**
 * Sample modelled on the Python output shape pinned in
 * filter-service/app/pixelate.py:152-163.
 */
const PYTHON_SVG_SAMPLE =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">\n` +
  `  <g id="colors" transform="scale(60 60)">\n` +
  `    <rect x="0" y="0" width="1" height="1" fill="#abcdef"/>\n` +
  `  </g>\n` +
  `  <g id="grid">\n` +
  `    <line x1="0" y1="0" x2="0" y2="720" stroke="black" stroke-width="1" />\n` +
  `  </g>\n` +
  `</svg>`

describe("padSvgToFullImage", () => {
  it("wraps the Python SVG body in an origWidth × origHeight outer SVG", () => {
    const out = padSvgToFullImage({
      pythonSvg: PYTHON_SVG_SAMPLE,
      origWidth: 1000,
      origHeight: 750,
      offsetX: 20,
      offsetY: 15,
    })
    expect(out).toContain(`width="1000"`)
    expect(out).toContain(`height="750"`)
    expect(out).toContain(`viewBox="0 0 1000 750"`)
  })

  it("emits a translate(offsetX offsetY) group wrapping the inner body", () => {
    const out = padSvgToFullImage({
      pythonSvg: PYTHON_SVG_SAMPLE,
      origWidth: 1000,
      origHeight: 750,
      offsetX: 20,
      offsetY: 15,
    })
    expect(out).toContain(`<g transform="translate(20 15)">`)
  })

  it("preserves the Python inner body verbatim (g#colors + g#grid)", () => {
    const out = padSvgToFullImage({
      pythonSvg: PYTHON_SVG_SAMPLE,
      origWidth: 1000,
      origHeight: 750,
      offsetX: 0,
      offsetY: 0,
    })
    expect(out).toContain(`<g id="colors" transform="scale(60 60)">`)
    expect(out).toContain(`<rect x="0" y="0" width="1" height="1" fill="#abcdef"/>`)
    expect(out).toContain(`<g id="grid">`)
    expect(out).toContain(
      `<line x1="0" y1="0" x2="0" y2="720" stroke="black" stroke-width="1" />`,
    )
  })

  it("throws when the input does not look like a Python pixelate SVG", () => {
    expect(() =>
      padSvgToFullImage({ pythonSvg: "not an svg", origWidth: 1, origHeight: 1, offsetX: 0, offsetY: 0 }),
    ).toThrow(/Python pixelate SVG/)
  })

  it("zero offset still produces a valid translate(0 0) wrapping", () => {
    const out = padSvgToFullImage({
      pythonSvg: PYTHON_SVG_SAMPLE,
      origWidth: 960,
      origHeight: 720,
      offsetX: 0,
      offsetY: 0,
    })
    expect(out).toContain(`<g transform="translate(0 0)">`)
  })
})
