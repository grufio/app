/**
 * Editor display-layers — single source of truth for "what renders on
 * the canvas" right now.
 *
 * Subsumes the legacy `computeTraceOverlay` (load-bearing invariant
 * established by PR series #76 → #82 → #83 → #84 → #86) and the
 * `canvasMode` derivation that lived inline in
 * `ProjectEditorShell.client.tsx` (extended for mobile in #350).
 *
 * The load-bearing invariants (from #76 → #86 + #350):
 *
 *  1. Filter operates on raster. The raster filter chain tip
 *     (`filterDisplayImageWithoutTrace`) is the Konva.Image source.
 *     Filter never reads from the trace SVG.
 *
 *  2. Trace is a transparent overlay above the raster filter tip. The
 *     trace SVG mounts in inline DOM above Konva, not as a replacement
 *     Konva.Image. Underlying filter colors must show through.
 *
 *  3. Layer surfacing differs by surface:
 *      - **Desktop**: gated by the active left-panel tab. The user is
 *        on the Filter tab → show filter chain tip; on the Trace tab
 *        → show trace overlay on top. On the Image tab the canvas
 *        shows the raw master even when filters / traces exist.
 *      - **Mobile** (`isMobile=true`): no tab UI — gated by data
 *        presence. Once a filter exists, the canvas shows the chain
 *        tip; once a trace exists, the overlay surfaces. Applying
 *        the artefact IS the implicit request to see it.
 *
 *  4. Data-presence invariants apply to both surfaces:
 *      - Filter chain tip needs `editorImageSourceReady`.
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
  filterStackLength: number
  editorImageSourceReady: boolean
  filterDisplayImage: DisplayImage | null | undefined
  filterDisplayImageWithoutTrace: DisplayImage | null | undefined
}): DisplayLayers {
  const {
    leftPanelTab,
    isMobile,
    filterStackLength,
    editorImageSourceReady,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
  } = input

  // Filter chain — desktop signal: the Filter tab is active. Mobile
  // signal: any filter exists. The image-ready gate stays universal.
  const filterIntent =
    leftPanelTab === "filter" || (isMobile && filterStackLength > 0)
  const showFilterChain = filterIntent && editorImageSourceReady

  // Trace overlay — desktop signal: Trace tab is active. Mobile
  // signal: a trace exists in the database (no tab UI to opt in).
  // Data-presence gates (both images present + IDs differ) stay
  // universal — without a real artefact there's nothing to overlay.
  const traceIntent = isMobile || leftPanelTab === "trace"
  let traceOverlaySvgUrl: string | null = null
  if (
    traceIntent &&
    filterDisplayImage &&
    filterDisplayImageWithoutTrace &&
    filterDisplayImage.id !== filterDisplayImageWithoutTrace.id
  ) {
    traceOverlaySvgUrl = filterDisplayImage.signedUrl
  }

  return { showFilterChain, traceOverlaySvgUrl }
}
