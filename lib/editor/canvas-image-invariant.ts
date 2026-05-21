/**
 * Canvas-image invariant — the canvas-source ID always matches the
 * editor workflow's source ID.
 *
 * The editor's master image is immutable (`guard_master_immutable`
 * DB trigger); every editor mutation operates on a working-copy
 * (`kind = 'working_copy' | 'filter_working_copy'`). The
 * persistence layer (`useImageState`, `image-workflow.machine.ts`)
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
 * Priority:
 *   1. `traceBaseImage` — the cropped source bitmap a pixelate trace
 *      writes alongside its SVG. When present, it replaces the
 *      filter-tip on the canvas so the SVG overlay sits 1:1 on its
 *      own bitmap and the cropped-out border doesn't leak through.
 *      Persistence stays anchored at the filter chain; the canvas
 *      source ID swap is purely visual for the Trace overlay.
 *   2. `filterDisplayImageWithoutTrace` — the trace-free working
 *      copy. Default canvas source for the Image / Filter tabs and
 *      for any trace kind that doesn't crop (lineart). Matches the
 *      persistence target.
 *   3. `stageImage` — workflow-source fallback while the working
 *      copy is still loading.
 */
export function pickCanvasImage(input: {
  traceBaseImage: CanvasSource | null
  filterDisplayImageWithoutTrace: CanvasSource | null
  stageImage: CanvasImage | null
}): CanvasImage | null {
  const { traceBaseImage, filterDisplayImageWithoutTrace, stageImage } = input
  if (traceBaseImage) {
    return {
      id: traceBaseImage.id,
      signedUrl: traceBaseImage.signedUrl,
      name: traceBaseImage.name,
      width_px: traceBaseImage.width_px,
      height_px: traceBaseImage.height_px,
      dpi: null,
      restore_base: null,
    }
  }
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
