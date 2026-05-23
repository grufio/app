/**
 * Canvas-image invariant — the canvas-source ID always matches the
 * editor workflow's source ID.
 *
 * The editor's master image is immutable (`guard_master_immutable`
 * DB trigger); every editor mutation operates on a working-copy
 * (`kind = 'working_copy' | 'filter_working_copy'`). The
 * persistence layer (`useDisplaySize`, `image-workflow.machine.ts`)
 * is keyed off the workflow's source image — which is the working-
 * copy chain tip. If the canvas-displayed image ID drifts away
 * from that — e.g. by routing the Image tab to the master directly
 * — load / save target the wrong row and user edits silently
 * disappear.
 *
 * Codifying the choice in a pure function (mirroring
 * `trace-overlay-invariant.ts`) keeps the rule in one place and
 * makes it testable without `renderHook`.
 */
export type CanvasSource = {
  id: string
  signedUrl: string
  name: string
  width_px: number
  height_px: number
}

export type CanvasImage = {
  id: string
  signedUrl: string
  name: string
  width_px: number
  height_px: number
  dpi: number | null
  restore_base: null
}

/**
 * Maps the workflow-source snapshot's ready image to the canvas-
 * source shape. Returns null when the workflow isn't ready.
 */
export function deriveStageImage(input: {
  editorImageSourceStatus: "loading" | "ready" | "empty" | "error"
  editorImageSourceImage: CanvasSource | null
}): CanvasImage | null {
  if (input.editorImageSourceStatus !== "ready" || !input.editorImageSourceImage) return null
  const img = input.editorImageSourceImage
  return {
    id: img.id,
    signedUrl: img.signedUrl,
    name: img.name,
    width_px: img.width_px,
    height_px: img.height_px,
    dpi: null,
    restore_base: null,
  }
}

/**
 * Picks the canvas-rendered image.
 *
 * Post the working-copy refactor, the canvas always renders the
 * working_copy (or its filter chain tip). The trace SVG overlays via
 * `TraceInlineSvg` on top, positioned by the master state in
 * `project_image_state`. The `trace_base` bitmap is Python-service
 * data for cell-color sampling; it is NOT rendered on the canvas.
 *
 * Earlier versions of this picker preferred `trace_base` whenever a
 * trace was active, which routed the canvas through trace_base's
 * source-crop intrinsic pixels (landscape, regardless of the user's
 * resize) and rendered the trace at the original image proportions.
 * That bug class is closed by always staying on the working_copy /
 * filter tip.
 *
 * Priority:
 *   1. `filterDisplayImageWithoutTrace` — the trace-free working
 *      copy. Default canvas source for Image / Filter / Trace tabs.
 *   2. `stageImage` — workflow-source fallback while the working
 *      copy is still loading.
 */
export function pickCanvasImage(input: {
  filterDisplayImageWithoutTrace: CanvasSource | null
  stageImage: CanvasImage | null
}): CanvasImage | null {
  const { filterDisplayImageWithoutTrace, stageImage } = input
  if (filterDisplayImageWithoutTrace) {
    return {
      id: filterDisplayImageWithoutTrace.id,
      signedUrl: filterDisplayImageWithoutTrace.signedUrl,
      name: filterDisplayImageWithoutTrace.name,
      width_px: filterDisplayImageWithoutTrace.width_px,
      height_px: filterDisplayImageWithoutTrace.height_px,
      dpi: null,
      restore_base: null,
    }
  }
  return stageImage
}
