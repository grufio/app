import { describe, expect, it } from "vitest"

import { displayTxToMm } from "./display-tx-to-mm"

// 200 mm and 100 mm expressed as µpx at GEOMETRY_PPI=72: mm / 25.4 * 72 * 1e6
const W_200MM = 566929134n
const H_100MM = 283464567n

describe("displayTxToMm", () => {
  it("converts the authoritative display transform to mm", () => {
    const r = displayTxToMm({
      displayTxU: { w: W_200MM, h: H_100MM },
      artboardWidthPx: 1000,
      artboardHeightPx: 1000,
    })
    expect(r).not.toBeNull()
    expect(r!.displayMmW).toBeCloseTo(200, 2)
    expect(r!.displayMmH).toBeCloseTo(100, 2)
  })

  it("preserves the resize aspect (2:1 stays 2:1, never collapsed to a square)", () => {
    // Invariant 1: the one source carries the user's resize. There is no
    // intrinsic fallback that could collapse a 2:1 resize to a 1:1 master
    // square — the old `resolve-trace-display-mm` "DOCUMENTED FRAGILITY
    // (WS-3)" path is gone by construction.
    const r = displayTxToMm({
      displayTxU: { w: W_200MM, h: H_100MM },
      artboardWidthPx: 2000,
      artboardHeightPx: 2000,
    })
    expect(r!.displayMmW).toBeGreaterThan(r!.displayMmH)
    expect(r!.displayMmW / r!.displayMmH).toBeCloseTo(2, 2)
  })

  it("returns null when there is no source (genuine fresh upload — NOT an intrinsic fallback)", () => {
    // The replaced resolver fell back to the master intrinsic here,
    // silently showing the wrong (square) size. The new contract: no
    // source → null, and the caller declines to open the trace dialog
    // until the canvas has placed the image.
    expect(
      displayTxToMm({ displayTxU: null, artboardWidthPx: 2000, artboardHeightPx: 2000 }),
    ).toBeNull()
    expect(
      displayTxToMm({ displayTxU: undefined, artboardWidthPx: 2000, artboardHeightPx: 2000 }),
    ).toBeNull()
  })

  it("returns null without an artboard", () => {
    expect(
      displayTxToMm({ displayTxU: { w: W_200MM, h: H_100MM }, artboardWidthPx: 0, artboardHeightPx: 0 }),
    ).toBeNull()
  })

  it("returns null when the source has zero dimensions", () => {
    expect(
      displayTxToMm({ displayTxU: { w: 0n, h: 0n }, artboardWidthPx: 1000, artboardHeightPx: 1000 }),
    ).toBeNull()
  })
})
