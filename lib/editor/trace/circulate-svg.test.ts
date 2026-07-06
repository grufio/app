import { describe, expect, it } from "vitest"

import { buildCirculateSvg } from "./circulate-svg"

const cc = (r: number[], g: number[], b: number[]) => ({
  r: Uint8ClampedArray.from(r),
  g: Uint8ClampedArray.from(g),
  b: Uint8ClampedArray.from(b),
})

describe("buildCirculateSvg", () => {
  const fractions = { outerWFrac: 0.8, outerHFrac: 0.8, innerWFrac: 0.4, innerHFrac: 0.4 }

  it("emits a viewBox of cellsX × cellsY with cells + frames groups", () => {
    const svg = buildCirculateSvg({
      cellsX: 2,
      cellsY: 1,
      outer: cc([255, 0], [0, 255], [0, 0]),
      inner: null,
      ellipseFractions: fractions,
    })
    expect(svg).toContain('viewBox="0 0 2 1"')
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain('<g id="cells">')
    expect(svg).toContain('<g id="frames">')
  })

  it("places outer ellipses at cell centres with fraction/2 radii and hex fills", () => {
    const svg = buildCirculateSvg({
      cellsX: 2,
      cellsY: 1,
      outer: cc([255, 17], [0, 34], [0, 51]),
      inner: null,
      ellipseFractions: fractions,
    })
    // cell (0,0): centre (0.5,0.5), rx=ry=0.4, fill #ff0000
    expect(svg).toContain('<ellipse cx="0.5" cy="0.5" rx="0.4" ry="0.4" fill="#ff0000"/>')
    // cell (1,0): centre (1.5,0.5), fill #112233
    expect(svg).toContain('cx="1.5" cy="0.5" rx="0.4" ry="0.4" fill="#112233"')
  })

  it("draws frame outlines as constant-width non-scaling hairlines", () => {
    const svg = buildCirculateSvg({
      cellsX: 1,
      cellsY: 1,
      outer: cc([0], [0], [0]),
      inner: null,
      ellipseFractions: fractions,
    })
    expect(svg).toContain('fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1" vector-effect="non-scaling-stroke"')
  })

  it("adds the inner ellipse only when inner colors are provided", () => {
    const withInner = buildCirculateSvg({
      cellsX: 1,
      cellsY: 1,
      outer: cc([10], [10], [10]),
      inner: cc([200], [200], [200]),
      ellipseFractions: fractions,
    })
    // outer (rx .4) + inner (rx .2) → two cell ellipses + one frame
    expect((withInner.match(/<ellipse /g) ?? []).length).toBe(3)
    expect(withInner).toContain('rx="0.2" ry="0.2" fill="#c8c8c8"')

    const noInner = buildCirculateSvg({
      cellsX: 1,
      cellsY: 1,
      outer: cc([10], [10], [10]),
      inner: null,
      ellipseFractions: fractions,
    })
    // outer cell ellipse + frame ellipse = 2
    expect((noInner.match(/<ellipse /g) ?? []).length).toBe(2)
  })
})
