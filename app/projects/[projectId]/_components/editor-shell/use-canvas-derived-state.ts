"use client"

/**
 * Canvas display state derived from the editor source + active section.
 *
 * Three values fall out of the same set of inputs and belong together:
 *
 *  - `canvasImage` — the Konva.Image source. Working-copy base (with
 *    `stageImage` fallback while it loads). On Image / Artboard section
 *    the visible `signedUrl` is swapped to the master URL so the user
 *    sees the raw image (filter / trace are not surfaced in that
 *    section); ID + dims stay on the working copy to preserve the
 *    canvas-source-ID-equals-workflow-source-ID invariant — see
 *    `lib/editor/canvas-image-invariant.ts`.
 *
 *  - `traceOverlaySvgUrl` and `showFilterChain` — both derived via
 *    `deriveDisplayLayers` in `lib/editor/display-layers.ts`. Trace
 *    SVG overlays via `TraceInlineSvg` at the working_copy's display
 *    rect; `showFilterChain` toggles `canvasMode` (filter-row
 *    highlighting; canvasImage source itself is selected here).
 *
 * Section semantics (desktop `leftPanelTab` / mobile `mobileSection`):
 *  - Image / Artboard → raw master visible, no filter row highlight,
 *    no trace overlay
 *  - Filter → working copy (chain tip) visible, filter row highlight
 *    active, no trace overlay
 *  - Trace → working copy visible, trace overlay on top
 */
import { useMemo } from "react"

import {
  deriveStageImage,
  pickCanvasImage,
  type CanvasImage,
} from "@/lib/editor/canvas-image-invariant"
import { deriveDisplayLayers, type MobileSection } from "@/lib/editor/display-layers"
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
  /** Active mobile section driven by the bottom-nav. Ignored when
   * `isMobile=false`. */
  mobileSection: MobileSection
  /** True on `< md` viewports. Switches the display-layer gating and
   * the canvas-image section override from `leftPanelTab` (desktop)
   * to `mobileSection` (mobile). */
  isMobile: boolean
  /** Master image signed URL — surfaced as the canvas image on the
   * Image / Artboard section so the user sees the raw upload, not
   * the filter chain tip. Null when no master is uploaded yet. */
  masterSignedUrl: string | null
}) {
  const {
    leftPanelTab,
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    mobileSection,
    isMobile,
    masterSignedUrl,
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
        mobileSection,
        editorImageSourceReady: editorImageSource.status === "ready",
        filterDisplayImage,
        filterDisplayImageWithoutTrace,
      }),
    [
      leftPanelTab,
      isMobile,
      mobileSection,
      editorImageSource.status,
      filterDisplayImage,
      filterDisplayImageWithoutTrace,
    ],
  )

  // Image / Artboard section surfaces the raw master URL — desktop
  // uses `leftPanelTab === "image"`, mobile uses
  // `mobileSection === "artboard"`. ID + dimensions stay on the
  // working copy regardless (persistence invariant).
  const showRawMaster = isMobile
    ? mobileSection === "artboard"
    : leftPanelTab === "image"

  const canvasImage = useMemo<CanvasImage | null>(
    () =>
      pickCanvasImage({
        filterDisplayImageWithoutTrace,
        stageImage,
        showRawMaster,
        masterSignedUrl,
      }),
    [filterDisplayImageWithoutTrace, stageImage, showRawMaster, masterSignedUrl],
  )

  return {
    stageImage,
    canvasImage,
    traceOverlaySvgUrl: displayLayers.traceOverlaySvgUrl,
    showFilterChain: displayLayers.showFilterChain,
  }
}
