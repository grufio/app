import { describe, expect, it } from "vitest"

import { deriveDisplayLayers } from "./display-layers"

const rasterTip = { id: "raster-tip", signedUrl: "https://example.test/raster.png" }
const traceArtefact = { id: "trace-svg", signedUrl: "https://example.test/trace.svg" }

// Default input — desktop, image not ready, no filters, no real trace.
// Each test overrides only what it cares about.
const base = {
  leftPanelTab: "image",
  isMobile: false,
  filterStackLength: 0,
  editorImageSourceReady: true,
  filterDisplayImage: rasterTip,
  filterDisplayImageWithoutTrace: rasterTip,
}

describe("deriveDisplayLayers — trace overlay (invariant from #76 → #86 + #350)", () => {
  it("returns null on the Image tab even when a trace exists", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "image",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null on the Filter tab even when a trace exists", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "filter",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns the trace svg url on the Trace tab when display IDs differ", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
  })

  it("returns null on the Trace tab when no trace artefact exists (IDs match)", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      filterDisplayImage: rasterTip,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null when the trace-free image is missing", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: null,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null when the trace-aware image is missing", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      filterDisplayImage: null,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("on mobile returns the trace url regardless of leftPanelTab", () => {
    // Mobile has no tab UI; once a trace exists, the overlay surfaces.
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "image",
      isMobile: true,
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
  })

  it("on mobile still respects the data invariants (IDs must differ)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      filterDisplayImage: rasterTip,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })
})

describe("deriveDisplayLayers — showFilterChain (from #350)", () => {
  it("desktop Filter tab + image ready → showFilterChain is true", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "filter",
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(true)
  })

  it("desktop Image tab + image ready → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "image",
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("desktop Trace tab + image ready → showFilterChain is false (trace overlays the master, doesn't replace it)", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("desktop Filter tab but image not ready → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "filter",
      editorImageSourceReady: false,
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("mobile + non-empty filter stack + image ready → showFilterChain is true", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      filterStackLength: 1,
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(true)
  })

  it("mobile + empty filter stack → showFilterChain is false (no filter to surface)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      filterStackLength: 0,
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("mobile + filters present but image not ready → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      filterStackLength: 2,
      editorImageSourceReady: false,
    })
    expect(result.showFilterChain).toBe(false)
  })
})
