import { describe, expect, it } from "vitest"

import { deriveDisplayLayers } from "./display-layers"

const rasterTip = { id: "raster-tip", signedUrl: "https://example.test/raster.png" }
const traceArtefact = { id: "trace-svg", signedUrl: "https://example.test/trace.svg" }

// Default input — image section, image ready, no real trace (IDs
// match). One `activeSection` input drives both viewports now. Each
// test overrides only the fields that matter for the assertion.
const base = {
  activeSection: "image" as const,
  editorImageSourceReady: true,
  filterDisplayImage: rasterTip,
  filterDisplayImageWithoutTrace: rasterTip,
}

describe("deriveDisplayLayers — trace overlay (invariant from #76 → #86)", () => {
  it("returns null on the Image section even when a trace exists", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "image",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null on the Filter section even when a trace exists", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "filter",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns the trace svg url on the Trace section when display IDs differ", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
  })

  it("returns null on the Trace section when no trace artefact exists (IDs match)", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: rasterTip,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null when the trace-free image is missing", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: null,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null when the trace-aware image is missing", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: null,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("returns null when both images are undefined", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: undefined,
      filterDisplayImageWithoutTrace: undefined,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })
})

describe("deriveDisplayLayers — section gating is viewport-agnostic", () => {
  it("section=trace + trace artefact → overlay URL surfaces", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
  })

  it("section=filter + trace artefact → overlay null (filter section never shows trace)", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "filter",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("section=image + trace artefact → overlay null (image section never shows trace)", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "image",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })

  it("section=trace still respects data invariants (IDs must differ)", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: rasterTip,
      filterDisplayImageWithoutTrace: rasterTip,
    })
    expect(result.traceOverlaySvgUrl).toBeNull()
  })
})

describe("deriveDisplayLayers — showFilterChain", () => {
  it("Filter section + image ready → showFilterChain is true", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "filter",
      editorImageSourceReady: true,
    })
    expect(result.showFilterChain).toBe(true)
  })

  it("Image section → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "image",
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("Trace section → showFilterChain is false (trace overlays, doesn't switch chain mode)", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
    })
    expect(result.showFilterChain).toBe(false)
  })

  it("Filter section but image not ready → showFilterChain is false", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "filter",
      editorImageSourceReady: false,
    })
    expect(result.showFilterChain).toBe(false)
  })
})

describe("deriveDisplayLayers — Trace view flags are section-scoped", () => {
  // The three Trace visibility toggles (Trace cells, Preview bitmap,
  // Numbers labels) persist in session state so the user's last view
  // preference survives a section trip — but their *canvas effect*
  // must not leak into other sections. Off-Trace the effective value
  // collapses to `true` (= show everything as if no toggle existed).

  it("Image section: all three effective flags are true regardless of session input", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "image",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("Filter section: all three effective flags are true regardless of session input", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "filter",
      traceOverlayVisible: false,
      previewBitmapVisible: false,
      numbersLayerVisible: false,
    })
    expect(result.traceOverlayVisible).toBe(true)
    expect(result.previewBitmapVisible).toBe(true)
    expect(result.numbersLayerVisible).toBe(true)
  })

  it("Trace section: session values pass through unchanged", () => {
    const result = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
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
    const result = deriveDisplayLayers({ ...base, activeSection: "trace" })
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
      activeSection: "filter",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
      previewBitmapVisible: false,
    })
    expect(offTrace.traceOverlaySvgUrl).toBeNull()
    expect(offTrace.previewBitmapVisible).toBe(true)

    const onTrace = deriveDisplayLayers({
      ...base,
      activeSection: "trace",
      filterDisplayImage: traceArtefact,
      filterDisplayImageWithoutTrace: rasterTip,
      previewBitmapVisible: false,
    })
    expect(onTrace.traceOverlaySvgUrl).toBe(traceArtefact.signedUrl)
    expect(onTrace.previewBitmapVisible).toBe(false)
  })
})
