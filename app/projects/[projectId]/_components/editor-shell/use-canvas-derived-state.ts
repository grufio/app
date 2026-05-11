"use client"

/**
 * Canvas display state derived from the editor source + active tab.
 *
 * Three values fall out of the same set of inputs and belong
 * together:
 *
 *  - `stageImage`        — fallback canvas source from the workflow
 *                          adapter (trace-aware default).
 *  - `canvasImage`       — what the Konva.Image actually renders,
 *                          chosen by tab:
 *                            image  → masterImage
 *                            filter → filterDisplayImageWithoutTrace
 *                            trace  → filterDisplayImageWithoutTrace
 *                          Falls back to `stageImage` when the
 *                          preferred source isn't ready yet.
 *  - `traceOverlaySvgUrl` — see
 *    `lib/editor/trace-overlay-invariant.ts` for the invariant
 *    locked down by PR series #76 → #86.
 *
 * Pulled out of `ProjectEditorShell.client.tsx` so the shell's JSX
 * reads cleanly and so the derivation grows in one place.
 */
import { useMemo } from "react"

import type { MasterImage } from "@/lib/editor/hooks/use-master-image"
import type { WorkflowSourceSnapshot } from "@/lib/editor/machines/image-workflow.types"
import { computeTraceOverlay } from "@/lib/editor/trace-overlay-invariant"

type DisplayImage = {
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
  restore_base: MasterImage["restore_base"] | null
}

export function useCanvasDerivedState(input: {
  leftPanelTab: string
  editorImageSource: WorkflowSourceSnapshot
  masterImage: MasterImage | null
  filterDisplayImage: DisplayImage | null
  filterDisplayImageWithoutTrace: DisplayImage | null
}) {
  const { leftPanelTab, editorImageSource, masterImage, filterDisplayImage, filterDisplayImageWithoutTrace } = input

  const stageImage = useMemo<CanvasImage | null>(() => {
    const readyImage = editorImageSource.status === "ready" ? editorImageSource.image : null
    if (!readyImage) return null
    return {
      id: readyImage.id,
      signedUrl: readyImage.signedUrl,
      name: readyImage.name,
      width_px: readyImage.width_px,
      height_px: readyImage.height_px,
      dpi: null,
      restore_base: null,
    }
  }, [editorImageSource])

  // What the canvas actually renders depends on the active left-
  // panel tab:
  // - "image": the raw master image — no filters, no trace
  // - "filter" + "trace": the filter chain tip without the trace
  //   override. The Trace tab composes the trace SVG ON TOP of this
  //   raster (see `traceOverlaySvgUrl` below); the Filter tab leaves
  //   the trace overlay off and shows only the raster.
  // Each branch falls back to `stageImage` (the trace-aware default)
  // when its preferred source is unavailable (loading / empty).
  const canvasImage = useMemo<CanvasImage | null>(() => {
    if (leftPanelTab === "image" && masterImage) {
      return {
        id: masterImage.id,
        signedUrl: masterImage.signedUrl,
        name: masterImage.name,
        width_px: masterImage.width_px,
        height_px: masterImage.height_px,
        dpi: masterImage.dpi ?? null,
        restore_base: masterImage.restore_base ?? null,
      }
    }
    if (filterDisplayImageWithoutTrace) {
      // Filter + Trace tabs both put the raster filter tip on the
      // canvas; only the overlay differs between them.
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
  }, [leftPanelTab, masterImage, filterDisplayImageWithoutTrace, stageImage])

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

  return { stageImage, canvasImage, traceOverlaySvgUrl }
}
