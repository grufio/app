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
 * Section semantics (one `mobileSection` input, both viewports):
 *  - Artboard → raw master visible, no filter row highlight, no trace
 *    overlay
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
  editorImageSource: WorkflowSourceSnapshot
  filterDisplayImage: DisplayImage | null
  filterDisplayImageWithoutTrace: DisplayImage | null
  /** Active editor section (the shell's `mobileSection`) — drives the
   * canvas gating on both viewports. */
  mobileSection: MobileSection
  /** Master image signed URL — surfaced as the canvas image on the
   * Artboard section so the user sees the raw upload, not the filter
   * chain tip. Null when no master is uploaded yet. */
  masterSignedUrl: string | null
  /** Raw Trace view-toggle session values. The hook returns the
   * *effective* values via `deriveDisplayLayers` — gated on the
   * Trace section being active. Pass the session values; let the
   * derivation gate the canvas effect. */
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
}) {
  const {
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    mobileSection,
    masterSignedUrl,
    traceOverlayVisible,
    previewBitmapVisible,
    numbersLayerVisible,
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
        activeSection: mobileSection,
        editorImageSourceReady: editorImageSource.status === "ready",
        filterDisplayImage,
        filterDisplayImageWithoutTrace,
        traceOverlayVisible,
        previewBitmapVisible,
        numbersLayerVisible,
      }),
    [
      mobileSection,
      editorImageSource.status,
      filterDisplayImage,
      filterDisplayImageWithoutTrace,
      traceOverlayVisible,
      previewBitmapVisible,
      numbersLayerVisible,
    ],
  )

  // Artboard section surfaces the raw master URL. ID + dimensions stay
  // on the working copy regardless (persistence invariant).
  const showRawMaster = mobileSection === "artboard"

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
    /** Section-gated Trace view flags. Outside the Trace section
     * these are always `true` regardless of session state — see
     * `deriveDisplayLayers` doc-comment. */
    traceOverlayVisible: displayLayers.traceOverlayVisible,
    previewBitmapVisible: displayLayers.previewBitmapVisible,
    numbersLayerVisible: displayLayers.numbersLayerVisible,
  }
}
