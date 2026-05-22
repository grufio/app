"use client"

/**
 * Editor stage wrapper (canvas + overlays).
 *
 * Responsibilities:
 * - Render the Konva canvas stage and wire persistence callbacks.
 * - Apply the "page background" style behind the canvas when enabled.
 *
 * Mutation-gating matrix (resolved at this layer, passed down as props):
 *
 *   | Prop              | Means                                  | Gated by              |
 *   |-------------------|----------------------------------------|-----------------------|
 *   | `mutationsEnabled`| Image is editable (drag/resize/rotate) | `!selectDisabled`     |
 *   | `imageDraggable`  | Click on image starts a drag           | Tool-mode (select)    |
 *   | `cropEnabled`     | Crop overlay is interactive            | Per-tab feature flag  |
 *   | `rotateEnabled`   | Rotate handle visible                  | Per-tab feature flag  |
 *   | `panEnabled`      | Empty-canvas drag pans the viewport    | Tool-mode (hand)      |
 *
 * `mutationsEnabled` is **independent** of tab — Filter, Trace, Image
 * all allow transform mutations because state is project-wide
 * (anchored at working_copy.id post PR #257). Crop and rotate are per-tab.
 * Recoupling these (pre-PR #128) caused resize/position to silently
 * no-op on Filter and Trace tabs.
 */
import * as React from "react"
import dynamic from "next/dynamic"

import { computeRgbaBackgroundStyleFromHex } from "@/lib/editor/color"
import {
  FloatingToolbar,
  type FloatingToolbarTool,
} from "./floating-toolbar"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"

// Code-split Konva-heavy canvas stage (no UI change, improves editor TTI).
// While Konva is being downloaded the page used to show a blank box; now it
// shows a centered framed Skeleton so the user can see "something is coming".
function CanvasBootSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
      <div className="aspect-[4/3] w-1/2 max-w-md min-w-[200px]">
        <div className="bg-accent/40 h-full w-full animate-pulse rounded-md border border-border/40" />
      </div>
    </div>
  )
}

const ProjectCanvasStage = dynamic(
  () => import("./project-canvas-stage").then((m) => m.ProjectCanvasStage),
  { ssr: false, loading: () => <CanvasBootSkeleton /> }
)

type CanvasInitialImageTransform = React.ComponentProps<typeof ProjectCanvasStage>["initialImageTransform"]
type CanvasTransformCommit = React.ComponentProps<typeof ProjectCanvasStage>["onImageTransformCommit"]

export const ProjectEditorStage = React.memo(function ProjectEditorStage(props: {
  projectId: string
  masterImage: {
    id?: string | null
    signedUrl?: string | null
    name?: string | null
    width_px?: number | null
    height_px?: number | null
    dpi?: number | null
    restore_base?: {
      id: string
      width_px: number
      height_px: number
      dpi?: number | null
    } | null
  } | null
  masterImageLoading: boolean
  masterImageError: string
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  toolbar: {
    tool: FloatingToolbarTool
    setTool: (t: FloatingToolbarTool) => void
    selectDisabled?: boolean
    showDirectSelect?: boolean
    cropDisabled?: boolean
    actions: {
      zoomIn: () => void
      zoomOut: () => void
      fit: () => void
      rotate: () => void
    }
    actionsDisabled: boolean
    rotateDisabled?: boolean
    panEnabled: boolean
    imageDraggable: boolean
    cropEnabled?: boolean
    cropBusy?: boolean
  }
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  artboardWidthPx?: number
  artboardHeightPx?: number
  grid?: {
    spacingXPx: number
    spacingYPx: number
    lineWidthPx: number
    color: string
  } | null
  handleImageTransformChange: (tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => void
  initialImageTransform: CanvasInitialImageTransform
  saveImageState?: CanvasTransformCommit
  onCropDblClick?: () => void
  /** Signed URL to the trace SVG that should be rendered as an
   * interactive overlay above the Konva.Image. Forwarded as-is to
   * the canvas stage. Set by the shell when the Trace tab is
   * active and a `project_image_trace` row exists. */
  traceOverlaySvgUrl?: string | null
  /** Whether trace-overlay regions catch hover/click. True only
   * when the direct-selection tool is active on the Trace tab. */
  traceInteractive?: boolean
}) {
  const {
    masterImage,
    masterImageLoading: _masterImageLoading,
    masterImageError,
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    toolbar,
    canvasRef,
    artboardWidthPx,
    artboardHeightPx,
    grid,
    handleImageTransformChange,
    initialImageTransform,
    saveImageState,
    onCropDblClick,
    traceOverlaySvgUrl,
    traceInteractive = false,
  } = props

  void _masterImageLoading

  const bgStyle = React.useMemo(() => {
    return computeRgbaBackgroundStyleFromHex({ enabled: pageBgEnabled, hex: pageBgColor, opacityPercent: pageBgOpacity }) as
      | React.CSSProperties
      | undefined
  }, [pageBgColor, pageBgEnabled, pageBgOpacity])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* status/errors (no centering; keep it out of the canvas area) */}
      {masterImageError ? (
        <div className="px-6 pt-4">
          <div className="text-sm text-destructive">{masterImageError}</div>
        </div>
      ) : null}

      {/* Workspace */}
      <div className="relative min-h-0 flex-1" style={bgStyle}>
        {/* Floating toolbar overlay (Figma-like) */}
        <div className="absolute bottom-4 left-1/2 z-10 w-max -translate-x-1/2">
          <FloatingToolbar
            className="pointer-events-auto"
            tool={toolbar.tool}
            onToolChange={toolbar.setTool}
            showDirectSelect={Boolean(toolbar.showDirectSelect)}
            cropDisabled={Boolean(toolbar.cropDisabled)}
            onZoomIn={toolbar.actions.zoomIn}
            onZoomOut={toolbar.actions.zoomOut}
            onFit={toolbar.actions.fit}
            onRotate={toolbar.actions.rotate}
            actionsDisabled={toolbar.actionsDisabled}
            rotateDisabled={Boolean(toolbar.rotateDisabled)}
          />
        </div>
        <ProjectCanvasStage
            ref={canvasRef}
            src={masterImage?.signedUrl ?? undefined}
            activeImageId={masterImage?.id ?? null}
            restoreBaseImageId={masterImage?.restore_base?.id ?? undefined}
            alt={masterImage?.name ?? undefined}
            className="h-full w-full"
            panEnabled={toolbar.panEnabled}
            imageDraggable={Boolean(masterImage) && toolbar.imageDraggable}
            cropEnabled={Boolean(masterImage) && Boolean(toolbar.cropEnabled)}
            cropBusy={Boolean(toolbar.cropBusy)}
            rotateEnabled={!Boolean(toolbar.rotateDisabled)}
            // `mutationsEnabled` means "image is editable" — independent
            // of tab. Crop and rotate features have their own per-tab
            // flags (`cropEnabled` above, `rotateEnabled`). Coupling
            // them into a master switch (pre-PR #128) blocked
            // resize/position on Filter and Trace tabs, even though
            // `project_image_state` is now project-wide (working_copy.id anchor)
            // and the user should be able to adjust transform on any tab.
            mutationsEnabled={!Boolean(toolbar.selectDisabled)}
            artboardWidthPx={artboardWidthPx ?? undefined}
            artboardHeightPx={artboardHeightPx ?? undefined}
            intrinsicWidthPx={
              typeof masterImage?.width_px === "number" && Number.isFinite(masterImage.width_px) ? masterImage.width_px : undefined
            }
            intrinsicHeightPx={
              typeof masterImage?.height_px === "number" && Number.isFinite(masterImage.height_px) ? masterImage.height_px : undefined
            }
            imageDpi={typeof masterImage?.dpi === "number" && Number.isFinite(masterImage.dpi) ? masterImage.dpi : undefined}
            restoreBaseWidthPx={
              typeof masterImage?.restore_base?.width_px === "number" && Number.isFinite(masterImage.restore_base.width_px)
                ? masterImage.restore_base.width_px
                : undefined
            }
            restoreBaseHeightPx={
              typeof masterImage?.restore_base?.height_px === "number" && Number.isFinite(masterImage.restore_base.height_px)
                ? masterImage.restore_base.height_px
                : undefined
            }
            restoreBaseDpi={
              typeof masterImage?.restore_base?.dpi === "number" && Number.isFinite(masterImage.restore_base.dpi)
                ? masterImage.restore_base.dpi
                : undefined
            }
            grid={grid ?? null}
            traceOverlaySvgUrl={traceOverlaySvgUrl ?? null}
            traceInteractive={traceInteractive}
            onImageTransformChange={handleImageTransformChange}
            initialImageTransform={masterImage ? initialImageTransform : null}
            onImageTransformCommit={masterImage ? saveImageState : undefined}
            onCropDblClick={onCropDblClick}
          />

      </div>
    </div>
  )
})

