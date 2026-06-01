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

describe("deriveDisplayLayers — Trace view flags are section-scoped", () => {
  // The three Trace visibility toggles (Trace cells, Preview bitmap,
  // Numbers labels) persist in session state so the user's last view
  // preference survives a tab trip — but their *canvas effect* must
  // not leak into other tabs. Off-Trace the effective value collapses
  // to `true` (= show everything as if no toggle existed). Asserted
  // for the full matrix: desktop × mobile × each flag false.

  it("desktop Image tab: all three effective flags are true regardless of session input", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "image",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("desktop Filter tab: all three effective flags are true regardless of session input", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "filter",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("desktop Trace tab: session values pass through unchanged", () => {
    const result = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(false)
    expect(result.previewBitmapVisible).toBe(false)
    expect(result.numbersLayerVisible).toBe(false)
  })

  it("mobile artboard section: all three effective flags are true", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "artboard",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("mobile filter section: all three effective flags are true", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "filter",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("mobile trace section: session values pass through unchanged", () => {
    const result = deriveDisplayLayers({
      ...base,
      isMobile: true,
      mobileSection: "trace",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(false)
    expect(result.previewBitmapVisible).toBe(false)
    expect(result.numbersLayerVisible).toBe(false)
  })

  it("defaults to true when session flags are omitted", () => {
    // Older callers that pre-date the visibility-flag inputs keep
    // compiling and behaving as if all three were `true`.
    const result = deriveDisplayLayers({ ...base, leftPanelTab: "trace" })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("section gate stays consistent between view flags and traceOverlaySvgUrl", () => {
    // Both outputs use `traceSectionActive` internally — they must
    // never disagree about whether Trace is active. Off-Trace the SVG
    // URL is null AND the view flags collapse to true together.
    const offTrace = deriveDisplayLayers({
      ...base,
      leftPanelTab: "filter",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
      previewBitmapVisible: false,
    })
    expect(offTrace.traceOverlaySvgUrl).toBeNull()
    expect(offTrace.previewBitmapVisible).toBe(true)

    const onTrace = deriveDisplayLayers({
      ...base,
      leftPanelTab: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
      previewBitmapVisible: false,
    })
    expect(onTrace.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
    expect(onTrace.previewBitmapVisible).toBe(false)
  })
})
