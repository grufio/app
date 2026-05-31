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
 *  3. `traceOverlaySvgUrl` is gated. The data-presence half of the
 *     gate is always required: a real trace artefact must exist
 *     (trace-aware display id differs from trace-free display id) and
 *     both images must be non-null. The user-intent half differs by
 *     surface:
 *      - **Desktop**: the user must be on the Trace tab. On the Image
 *        and Filter tabs the overlay stays off even when a trace
 *        exists — the user did not ask to see it there.
 *      - **Mobile** (`isMobile=true`): there's no tab UI, so the user
 *        signals intent by applying a trace at all. Once it exists in
 *        the database, the overlay surfaces — opening the trace sheet
 *        is not a precondition. The Visibility checkboxes inside the
 *        sheet still let the user hide it without removing.
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
 * literal "trace" returns null on desktop.
 *
 * `isMobile` (optional, defaults to false) flips the tab-gate off: on
 * mobile the data invariants alone decide whether the overlay surfaces.
 */
export function computeTraceOverlay(input: {
  leftPanelTab: string
  filterDisplayImage: DisplayImage | null | undefined
  filterDisplayImageWithoutTrace: DisplayImage | null | undefined
  isMobile?: boolean
}): string | null {
  const { leftPanelTab, filterDisplayImage, filterDisplayImageWithoutTrace, isMobile = false } = input
  if (!isMobile && leftPanelTab !== "trace") return null
  if (!filterDisplayImage || !filterDisplayImageWithoutTrace) return null
  if (filterDisplayImage.id === filterDisplayImageWithoutTrace.id) return null
  return filterDisplayImage.signedUrl
}
