import { describe, expect, it } from "vitest"

import { resolveTraceDisplayMm } from "./resolve-trace-display-mm"

// 200 mm and 100 mm expressed as µpx at GEOMETRY_PPI=72:
//   mm / 25.4 * 72 * 1e6
const W_200MM = 566929134n // ≈ 200 mm
const H_100MM = 283464567n // ≈ 100 mm

describe("resolveTraceDisplayMm", () => {
  it("uses the live canvas mirror (imageTxU) when present", () => {
    const r = resolveTraceDisplayMm({
      imageTxU: { w: W_200MM, h: H_100MM },
      initialImageTxU: { w: 1n, h: 1n },
      artboardWidthPx: 1000,
      artboardHeightPx: 1000,
      intrinsicW: 1254,
      intrinsicH: 1254,
      imageDpi: null,
    })
    expect(r).not.toBeNull()
    expect(r!.displayMmW).toBeCloseTo(200, 2)
    expect(r!.displayMmH).toBeCloseTo(100, 2)
  })

  it("falls back to the SSR seed (initialImageTxU) when the mirror is empty", () => {
    const r = resolveTraceDisplayMm({
      imageTxU: null,
      initialImageTxU: { w: W_200MM, h: H_100MM },
      artboardWidthPx: 1000,
      artboardHeightPx: 1000,
      intrinsicW: 1254,
      intrinsicH: 1254,
      imageDpi: null,
    })
    expect(r!.displayMmW).toBeCloseTo(200, 2)
    expect(r!.displayMmH).toBeCloseTo(100, 2)
  })

  it("prefers the live mirror over the SSR seed", () => {
    const r = resolveTraceDisplayMm({
      imageTxU: { w: W_200MM, h: H_100MM }, // 2:1 live resize
      initialImageTxU: { w: 100n, h: 100n }, // square seed — must be ignored
      artboardWidthPx: 1000,
      artboardHeightPx: 1000,
      intrinsicW: 1254,
      intrinsicH: 1254,
      imageDpi: null,
    })
    expect(r!.displayMmW).toBeCloseTo(200, 2)
    expect(r!.displayMmH).toBeCloseTo(100, 2)
  })

  it("DOCUMENTED FRAGILITY (WS-3): both transforms empty → silent master-intrinsic fallback (square master ⇒ 1:1)", () => {
    // No live mirror and no seed: the resolver falls back to the master
    // intrinsic. For a 1254×1254 (1:1) master @ default 72 DPI the
    // displayed size collapses to ~442 mm square — the resize is lost.
    const r = resolveTraceDisplayMm({
      imageTxU: null,
      initialImageTxU: null,
      artboardWidthPx: 2000,
      artboardHeightPx: 2000,
      intrinsicW: 1254,
      intrinsicH: 1254,
      imageDpi: null,
    })
    expect(r!.displayMmW).toBeCloseTo(442.38, 1)
    expect(r!.displayMmH).toBeCloseTo(442.38, 1)
    // The fallback aspect is the intrinsic (1:1), NOT the user's resize.
    expect(r!.displayMmW).toBe(r!.displayMmH)
  })

  it("honours the image DPI in the fallback (144 DPI halves the placed size)", () => {
    const r = resolveTraceDisplayMm({
      imageTxU: null,
      initialImageTxU: null,
      artboardWidthPx: 2000,
      artboardHeightPx: 2000,
      intrinsicW: 1254,
      intrinsicH: 1254,
      imageDpi: 144,
    })
    // scale = 72/144 = 0.5 → 627 px → 627/72*25.4 ≈ 221.19 mm
    expect(r!.displayMmW).toBeCloseTo(221.19, 1)
  })

  it("returns null without an artboard", () => {
    expect(
      resolveTraceDisplayMm({
        imageTxU: { w: W_200MM, h: H_100MM },
        initialImageTxU: null,
        artboardWidthPx: 0,
        artboardHeightPx: 0,
        intrinsicW: 1254,
        intrinsicH: 1254,
        imageDpi: null,
      }),
    ).toBeNull()
  })

  it("returns null when the fallback has no valid intrinsic", () => {
    expect(
      resolveTraceDisplayMm({
        imageTxU: null,
        initialImageTxU: null,
        artboardWidthPx: 1000,
        artboardHeightPx: 1000,
        intrinsicW: 0,
        intrinsicH: 0,
        imageDpi: null,
      }),
    ).toBeNull()
  })
})
