"use client"

/**
 * Canvas display state derived from the editor source + active tab.
 *
 * Two values fall out of the same set of inputs and belong together:
 *
 *  - `canvasImage` — the Konva.Image source. **Always the working-
 *    copy** (`filterDisplayImageWithoutTrace`), with `stageImage`
 *    fallback while the working copy is still loading. The master
 *    image is never the canvas source; the master is an immutable
 *    restore source (`guard_master_immutable` DB trigger). The
 *    decision is delegated to `pickCanvasImage` in
 *    `lib/editor/canvas-image-invariant.ts` so the invariant lives
 *    in one place and stays testable without rendering React.
 *
 *  - `traceOverlaySvgUrl` — see
 *    `lib/editor/trace-overlay-invariant.ts` for the invariant
 *    locked down by PR series #76 → #86. The Trace tab adds this
 *    overlay on top of the working-copy raster; the Image and Filter
 *    tabs leave it off.
 *
 * The three tabs differ only in their overlays, not in the canvas
 * source. The Image tab shows the bare working-copy; the Filter tab
 * shows the working-copy with filter-stack layers reflected in the
 * sidebar; the Trace tab adds the trace SVG overlay.
 */
import { useMemo } from "react"

import type { TraceBaseImage } from "@/lib/api/project-trace"
import type { WorkflowSourceSnapshot } from "@/lib/editor/machines/image-workflow.types"
import {
  deriveStageImage,
  pickCanvasImage,
  type CanvasImage,
  type CanvasSource,
} from "@/lib/editor/canvas-image-invariant"
import { computeTraceOverlay } from "@/lib/editor/trace-overlay-invariant"

export type { CanvasImage }

type DisplayImage = {
  id: string
  signedUrl: string
  name: string
  width_px: number
  height_px: number
}

export function useCanvasDerivedState(input: {
  leftPanelTab: string
  editorImageSource: WorkflowSourceSnapshot
  filterDisplayImage: DisplayImage | null
  filterDisplayImageWithoutTrace: DisplayImage | null
  /** Numerate trace's cropped source bitmap. When set, replaces
   * the filter-tip as the canvas background so the SVG overlay
   * sits 1:1 on its own bitmap and the cropped-out border doesn't
   * leak through. Null for lineart traces or before the trace
   * GET resolves. */
  traceBaseImage: TraceBaseImage | null
}) {
  const {
    leftPanelTab,
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    traceBaseImage,
  } = input

  const stageImage = useMemo<CanvasImage | null>(
    () =>
      deriveStageImage({
        editorImageSourceStatus: editorImageSource.status,
        editorImageSourceImage: editorImageSource.image,
      }),
    [editorImageSource],
  )

  // Trace overlay gating is the invariant established by PR series
  // #76 → #82 → #83 → #84 → #86 — see `lib/editor/trace-overlay-invariant.ts`
  // for the full rationale and the dedicated tests. The memo wraps a
  // pure helper so the invariant lives in one place and stays testable.
  const traceOverlaySvgUrl = useMemo(
    () =>
      computeTraceOverlay({
        leftPanelTab,
        filterDisplayImage,
        filterDisplayImageWithoutTrace,
      }),
    [leftPanelTab, filterDisplayImage, filterDisplayImageWithoutTrace],
  )

  // The cropped trace-base bitmap is the canvas background only when
  // the SVG overlay is also being rendered — otherwise the user sees
  // a mysteriously cropped image on the Image / Filter tabs. Gating
  // on `traceOverlaySvgUrl` keeps the two pieces of the trace view
  // (canvas swap + SVG overlay) in lock-step.
  const traceBaseCanvasSource = useMemo<CanvasSource | null>(() => {
    if (!traceBaseImage || !traceOverlaySvgUrl) return null
    return {
      id: traceBaseImage.id,
      signedUrl: traceBaseImage.signedUrl,
      name: "",
      width_px: traceBaseImage.width_px,
      height_px: traceBaseImage.height_px,
    }
  }, [traceBaseImage, traceOverlaySvgUrl])

  const canvasImage = useMemo<CanvasImage | null>(
    () =>
      pickCanvasImage({
        traceBaseImage: traceBaseCanvasSource,
        filterDisplayImageWithoutTrace,
        stageImage,
      }),
    [traceBaseCanvasSource, filterDisplayImageWithoutTrace, stageImage],
  )

  return { stageImage, canvasImage, traceOverlaySvgUrl }
}
