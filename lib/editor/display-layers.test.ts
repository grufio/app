import { describe, expect, it } from "vitest"

import { deriveDisplayLayers } from "./display-layers"

const rasterTip = { id: "raster-tip", signedUrl: "https://example.test/raster.png" }
const traceArtefact = { id: "trace-svg", signedUrl: "https://example.test/trace.svg" }

// Default input — desktop, image ready, no real trace (IDs match).
// Mobile section default `"artboard"`. Each test overrides only the
// fields that matter for the assertion.
const base = {
  leftPanelTab: "image",
  isMobile: false,
  mobileSection: "artboard" as const,
  editorImageSourceReady: true,
  filterDisplayImage: rasterTip,
  filterDisplayImageWithoutTrace: rasterTip,
}

describe("deriveDisplayLayers — trace overlay (invariant from #76 → #86)", () => {
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

  it("returns null when both images are undefined", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      filterDisplayImage: undefined,
      filterDisplayImageWithoutTrace: undefined,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })
})

describe("deriveDisplayLayers — mobile section gating mirrors desktop tab gating", () => {
  it("mobile + section=trace + trace artefact → overlay URL surfaces (regardless of leftPanelTab)", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "image",
      isMobile: true,
      mobileSection: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
  })

  it("mobile + section=filter + trace artefact → overlay null (filter section never shows trace)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "filter",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("mobile + section=artboard + trace artefact → overlay null (artboard section never shows trace)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "artboard",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("mobile + section=trace still respects data invariants (IDs must differ)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "trace",
      filterDisplayImage: rasterTip,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })
})

describe("deriveDisplayLayers — showFilterChain", () => {
  it("desktop Filter tab + image ready → showFilterChain is true", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "filter",
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(true)
  })

  it("desktop Image tab → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "image",
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("desktop Trace tab → showFilterChain is false (trace overlays, doesn't switch chain mode)", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
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

  it("mobile + section=filter + image ready → showFilterChain is true", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "filter",
    })
    expect(result.showFilterChain).toBe(true)
  })

  it("mobile + section=artboard → showFilterChain is false (artboard section never shows filter highlight)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "artboard",
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("mobile + section=trace → showFilterChain is false (trace section doesn't switch chain mode)", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "trace",
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("mobile + section=filter + image not ready → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "filter",
      editorImageSourceReady: false,
    })
    expect(result.showFilterChain).toBe(false)
  })
})
