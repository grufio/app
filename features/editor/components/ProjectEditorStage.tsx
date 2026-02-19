"use client"

/**
 * Editor stage wrapper (canvas + overlays).
 *
 * Responsibilities:
 * - Render the Konva canvas stage and wire persistence callbacks.
 * - Apply the “page background” style behind the canvas when enabled.
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
const ProjectCanvasStage = dynamic(
  () => import("./project-canvas-stage").then((m) => m.ProjectCanvasStage),
  { ssr: false, loading: () => <div className="h-full w-full" aria-hidden="true" /> }
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
  } | null
  masterImageLoading: boolean
  masterImageError: string
  imageStateLoading: boolean
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  toolbar: {
    tool: FloatingToolbarTool
    setTool: (t: FloatingToolbarTool) => void
    actions: {
      zoomIn: () => void
      zoomOut: () => void
      fit: () => void
      rotate: () => void
    }
    actionsDisabled: boolean
    panEnabled: boolean
    imageDraggable: boolean
  }
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  artboardWidthPx?: number
  artboardHeightPx?: number
  artboardDpi?: number
  grid?: {
    spacingXPx: number
    spacingYPx: number
    lineWidthPx: number
    color: string
  } | null
  handleImagePxChange: (w: bigint, h: bigint) => void
  initialImageTransform: CanvasInitialImageTransform
  saveImageState?: CanvasTransformCommit
}) {
  const {
    projectId,
    masterImage,
    masterImageLoading: _masterImageLoading,
    masterImageError,
    imageStateLoading,
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    toolbar,
    canvasRef,
    artboardWidthPx,
    artboardHeightPx,
    artboardDpi,
    grid,
    handleImagePxChange,
    initialImageTransform,
    saveImageState,
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
            onZoomIn={toolbar.actions.zoomIn}
            onZoomOut={toolbar.actions.zoomOut}
            onFit={toolbar.actions.fit}
            onRotate={toolbar.actions.rotate}
            actionsDisabled={toolbar.actionsDisabled}
          />
        </div>
        {masterImage && imageStateLoading ? (
          // Keep layout stable without "Loading…" text (per UX requirement).
          <div className="h-full w-full" aria-hidden="true" />
        ) : (
          <ProjectCanvasStage
            ref={canvasRef}
            src={masterImage?.signedUrl}
            activeImageId={masterImage?.id ?? null}
            alt={masterImage?.name}
            className="h-full w-full"
            panEnabled={toolbar.panEnabled}
            imageDraggable={Boolean(masterImage) && toolbar.imageDraggable}
            artboardWidthPx={artboardWidthPx ?? undefined}
            artboardHeightPx={artboardHeightPx ?? undefined}
            artboardDpi={artboardDpi ?? undefined}
            intrinsicWidthPx={
              typeof masterImage?.width_px === "number" && Number.isFinite(masterImage.width_px) ? masterImage.width_px : undefined
            }
            intrinsicHeightPx={
              typeof masterImage?.height_px === "number" && Number.isFinite(masterImage.height_px) ? masterImage.height_px : undefined
            }
            intrinsicDpi={typeof masterImage?.dpi === "number" && Number.isFinite(masterImage.dpi) ? masterImage.dpi : undefined}
            grid={grid ?? null}
            onImageSizeChange={handleImagePxChange}
            initialImageTransform={masterImage ? initialImageTransform : null}
            onImageTransformCommit={masterImage ? saveImageState : undefined}
          />
        )}

      </div>
    </div>
  )
})

