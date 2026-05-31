"use client"

/**
 * Canvas display state derived from the editor source + active tab.
 *
 * Three values fall out of the same set of inputs and belong together:
 *
 *  - `canvasImage` — the Konva.Image source. **Always the working-
 *    copy** (`filterDisplayImageWithoutTrace`), with `stageImage`
 *    fallback while the working copy is still loading. The master
 *    image is never the canvas source; the master is an immutable
 *    restore source. The decision is delegated to `pickCanvasImage`
 *    in `lib/editor/canvas-image-invariant.ts` so the invariant
 *    lives in one place and stays testable without rendering React.
 *
 *  - `traceOverlaySvgUrl` and `showFilterChain` — both derived via
 *    `deriveDisplayLayers` in `lib/editor/display-layers.ts`. That
 *    file owns the load-bearing invariant from PR series #76 → #86
 *    plus the mobile branch from #350, and its tests pin the
 *    behavior. Trace SVG overlays via `TraceInlineSvg` at the
 *    working_copy's display rect; `showFilterChain` flips canvasMode
 *    between "image" (raw master) and "filter" (chain tip).
 *
 * The three desktop tabs differ only in their overlays, not in the
 * canvas source. The trace_base bitmap is Python-service data for
 * cell-color sampling — it lives in `project_images` for completeness
 * but is NOT rendered on the canvas (would otherwise drag the canvas
 * to its source-crop pixel intrinsic, which doesn't match the
 * working_copy's display state).
 */
import { useMemo } from "react"

import {
  deriveStageImage,
  pickCanvasImage,
  type CanvasImage,
} from "@/lib/editor/canvas-image-invariant"
import { deriveDisplayLayers } from "@/lib/editor/display-layers"
import type { WorkflowSourceSnapshot } from "@/lib/editor/machines/image-workflow.types"

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
  filterStackLength: number
  /** True on `< md` viewports. On mobile both the trace overlay and
   * the filter-chain canvas mode surface based on data presence
   * instead of `leftPanelTab` — see `lib/editor/display-layers.ts`. */
  isMobile: boolean
}) {
  const {
    leftPanelTab,
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    filterStackLength,
    isMobile,
  } = input

  const stageImage = useMemo<CanvasImage | null>(
    () =>
      deriveStageImage({
        editorImageSourceStatus: editorImageSource.status,
        editorImageSourceImage: editorImageSource.image,
      }),
    [editorImageSource],
  )

  // Both layer-visibility outputs share one memo — the inputs overlap
  // heavily and the pure function returns both at once. The slight
  // over-recompute (e.g. filterStackLength change re-runs the trace
  // branch too) is acceptable for two output fields; revisit if we
  // ever profile a hotspot here.
  const displayLayers = useMemo(
    () =>
      deriveDisplayLayers({
        leftPanelTab,
        isMobile,
        filterStackLength,
        editorImageSourceReady: editorImageSource.status === "ready",
        filterDisplayImage,
        filterDisplayImageWithoutTrace,
      }),
    [
      leftPanelTab,
      isMobile,
      filterStackLength,
      editorImageSource.status,
      filterDisplayImage,
      filterDisplayImageWithoutTrace,
    ],
  )

  const canvasImage = useMemo<CanvasImage | null>(
    () =>
      pickCanvasImage({
        filterDisplayImageWithoutTrace,
        stageImage,
      }),
    [filterDisplayImageWithoutTrace, stageImage],
  )

  return {
    stageImage,
    canvasImage,
    traceOverlaySvgUrl: displayLayers.traceOverlaySvgUrl,
    showFilterChain: displayLayers.showFilterChain,
  }
}
