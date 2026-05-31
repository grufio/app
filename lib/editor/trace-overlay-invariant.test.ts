import { describe, expect, it } from "vitest"

import { computeTraceOverlay } from "./trace-overlay-invariant"

const rasterTip = { id: "raster-tip", signedUrl: "https://example.test/raster.png" }
const traceArtefact = { id: "trace-svg", signedUrl: "https://example.test/trace.svg" }

describe("computeTraceOverlay — invariant from PR series #76 → #86", () => {
  it("returns null on the Image tab even when a trace exists", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "image",
        filterDisplayImage: traceArtefact,
        filterDisplayImageWithoutTrace: rasterTip,
      }),
    ).toBeNull()
  })

  it("returns null on the Filter tab even when a trace exists", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "filter",
        filterDisplayImage: traceArtefact,
        filterDisplayImageWithoutTrace: rasterTip,
      }),
    ).toBeNull()
  })

  it("returns the trace svg url on the Trace tab when display IDs differ", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "trace",
        filterDisplayImage: traceArtefact,
        filterDisplayImageWithoutTrace: rasterTip,
      }),
    ).toBe(traceArtefact.signedUrl)
  })

  it("returns null on the Trace tab when no trace artefact exists (IDs match)", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "trace",
        filterDisplayImage: rasterTip,
        filterDisplayImageWithoutTrace: rasterTip,
      }),
    ).toBeNull()
  })

  it("returns null when the trace-free image is missing", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "trace",
        filterDisplayImage: traceArtefact,
        filterDisplayImageWithoutTrace: null,
      }),
    ).toBeNull()
  })

  it("returns null when the trace-aware image is missing", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "trace",
        filterDisplayImage: null,
        filterDisplayImageWithoutTrace: rasterTip,
      }),
    ).toBeNull()
  })

  it("returns null when both images are undefined", () => {
    expect(
      computeTraceOverlay({
        leftPanelTab: "trace",
        filterDisplayImage: undefined,
        filterDisplayImageWithoutTrace: undefined,
      }),
    ).toBeNull()
  })

  it("on mobile returns the trace url regardless of leftPanelTab", () => {
    // Mobile has no tab UI; once a trace exists, the overlay surfaces.
    expect(
      computeTraceOverlay({
        leftPanelTab: "image",
        filterDisplayImage: traceArtefact,
        filterDisplayImageWithoutTrace: rasterTip,
        isMobile: true,
      }),
    ).toBe(traceArtefact.signedUrl)
  })

  it("on mobile still respects the data invariants (IDs must differ)", () => {
    // The user-intent gate is dropped on mobile, but the data-presence
    // gate stays — without a real trace artefact the overlay is off.
    expect(
      computeTraceOverlay({
        leftPanelTab: "image",
        filterDisplayImage: rasterTip,
        filterDisplayImageWithoutTrace: rasterTip,
        isMobile: true,
      }),
    ).toBeNull()
  })
})
