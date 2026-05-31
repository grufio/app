/**
 * Editor display-layers — single source of truth for "what renders on
 * the canvas" right now.
 *
 * Subsumes the legacy `computeTraceOverlay` (load-bearing invariant
 * established by PR series #76 → #82 → #83 → #84 → #86) and the
 * `canvasMode` derivation that lived inline in
 * `ProjectEditorShell.client.tsx`.
 *
 * The load-bearing invariants:
 *
 *  1. Filter operates on raster. The raster filter chain tip
 *     (`filterDisplayImageWithoutTrace`) is the Konva.Image source.
 *     Filter never reads from the trace SVG.
 *
 *  2. Trace is a transparent overlay above the raster filter tip. The
 *     trace SVG mounts in inline DOM above Konva, not as a replacement
 *     Konva.Image. Underlying filter colors must show through.
 *
 *  3. Layer surfacing is **section-gated** — the same way on desktop
 *     and on mobile, just different inputs name the active section:
 *      - **Desktop**: `leftPanelTab` ("image" / "filter" / "trace").
 *      - **Mobile** (`isMobile=true`): `mobileSection` ("artboard" /
 *        "filter" / "trace"), driven by the bottom-nav. Mobile's
 *        "artboard" section maps to desktop's "image" tab.
 *
 *     - Filter section → `showFilterChain` true (Filter sidebar
 *       row-highlight switches on; canvas image source itself is
 *       always the working copy, so the visible image is the same
 *       in any section, but the filter UI accents differ).
 *     - Trace section → `traceOverlaySvgUrl` returns the URL when a
 *       real trace artefact exists.
 *     - Image/Artboard section → no filter chain highlight, no trace
 *       overlay. The user did not ask to see those there.
 *
 *  4. Data-presence invariants apply to both surfaces:
 *      - Filter chain needs `editorImageSourceReady`.
 *      - Trace overlay needs both display images (with/without trace)
 *        AND their IDs must differ — otherwise no real trace artefact
 *        exists.
 *
 * Codifying this in a pure function lets the integration tests pin the
 * behavior. Do not inline this back into `ProjectEditorShell` without
 * also moving the test file.
 *
 * Output type carries one boolean per logical layer + the trace
 * overlay URL when available. Future Colors / Output layers slot in
 * as additional booleans — consumer code stays a property lookup per
 * layer.
 */
export type DisplayImage = {
  id: string
  signedUrl: string
}

export type MobileSection = "artboard" | "filter" | "trace"

export type DisplayLayers = {
  /** True when the canvas should source from the filter chain tip
   * (`canvasMode === "filter"` in shell terms) instead of the raw
   * master. */
  showFilterChain: boolean
  /** The trace SVG URL when the overlay should surface, else null. */
  traceOverlaySvgUrl: string | null
}

export function deriveDisplayLayers(input: {
  leftPanelTab: string
  isMobile: boolean
  /** The active section on mobile (driven by the bottom-nav). Ignored
   * when `isMobile=false`. Mobile's "artboard" maps to desktop's
   * "image" — no filter chain, no trace overlay. */
  mobileSection: MobileSection
  editorImageSourceReady: boolean
  filterDisplayImage: DisplayImage | null | undefined
  filterDisplayImageWithoutTrace: DisplayImage | null | undefined
}): DisplayLayers {
  const {
    leftPanelTab,
    isMobile,
    mobileSection,
    editorImageSourceReady,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
  } = input

  // Section gating: desktop uses `leftPanelTab`, mobile uses
  // `mobileSection`. Pick whichever drives the user-intent for this
  // surface.
  const filterSectionActive = isMobile
    ? mobileSection === "filter"
    : leftPanelTab === "filter"
  const traceSectionActive = isMobile
    ? mobileSection === "trace"
    : leftPanelTab === "trace"

  // Filter chain — section + image-ready gate.
  const showFilterChain = filterSectionActive && editorImageSourceReady

  // Trace overlay — section + data-presence (both images present, IDs
  // differ = real artefact exists).
  let traceOverlaySvgUrl: string | null = null
  if (
    traceSectionActive &&
    filterDisplayImage &&
    filterDisplayImageWithoutTrace &&
    filterDisplayImage.id !== filterDisplayImageWithoutTrace.id
  ) {
    traceOverlaySvgUrl = filterDisplayImage.signedUrl
  }

  return { showFilterChain, traceOverlaySvgUrl }
}
