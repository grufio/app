/**
 * Trace-overlay invariant — established by PR series #76 → #82 → #83 →
 * #84 → #86 and load-bearing for the Trace tab.
 *
 * The invariant has three parts:
 *
 *  1. Filter operates on raster. The raster filter chain tip
 *     (`filterDisplayImageWithoutTrace`) is the Konva.Image source on
 *     the Filter and Trace tabs. Filter never reads from the trace SVG.
 *
 *  2. Trace is a transparent overlay above the raster filter tip. The
 *     trace SVG mounts in inline DOM above Konva, not as a replacement
 *     Konva.Image. Underlying filter colors must show through.
 *
 *  3. `traceOverlaySvgUrl` is gated. It returns a URL only when:
 *     - the user is on the Trace tab, AND
 *     - a real trace artefact exists (trace-aware display id differs
 *       from trace-free display id).
 *
 *     Otherwise it returns null. On the Image and Filter tabs the
 *     overlay must stay off, even when a trace exists in the database —
 *     the user did not ask to see it there.
 *
 * Codifying this in a pure function lets the integration tests pin the
 * behavior. Do not inline this back into `ProjectEditorShell` without
 * also moving the test.
 */
export type DisplayImage = {
  id: string
  signedUrl: string
}

/**
 * `leftPanelTab` is typed as `string` so any callsite (including
 * `EditorSidepanelTab` with its "colors" / "output" placeholders) can
 * pass its value without a narrowing dance. Anything other than the
 * literal "trace" returns null.
 */
export function computeTraceOverlay(input: {
  leftPanelTab: string
  filterDisplayImage: DisplayImage | null | undefined
  filterDisplayImageWithoutTrace: DisplayImage | null | undefined
}): string | null {
  const { leftPanelTab, filterDisplayImage, filterDisplayImageWithoutTrace } = input
  if (leftPanelTab !== "trace") return null
  if (!filterDisplayImage || !filterDisplayImageWithoutTrace) return null
  if (filterDisplayImage.id === filterDisplayImageWithoutTrace.id) return null
  return filterDisplayImage.signedUrl
}
