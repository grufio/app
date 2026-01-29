"use client"

/**
 * Editor stage wrapper (canvas + overlays).
 *
 * Responsibilities:
 * - Render the Konva canvas stage and wire persistence callbacks.
 * - Apply the “page background” style behind the canvas when enabled.
 */
import * as React from "react"

import { ProjectImageUploader } from "@/components/app-img-upload"
import {
  FloatingToolbar,
  type FloatingToolbarTool,
} from "./floating-toolbar"
import { ProjectCanvasStage, type ProjectCanvasStageHandle } from "./project-canvas-stage"

type CanvasInitialImageTransform = React.ComponentProps<typeof ProjectCanvasStage>["initialImageTransform"]
type CanvasTransformCommit = React.ComponentProps<typeof ProjectCanvasStage>["onImageTransformCommit"]

export function ProjectEditorStage(props: {
  projectId: string
  masterImage: { signedUrl?: string | null; name?: string | null; width_px?: number | null; height_px?: number | null } | null
  masterImageLoading: boolean
  masterImageError: string
  refreshMasterImage: () => void | Promise<void>
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
    masterImageLoading,
    masterImageError,
    refreshMasterImage,
    imageStateLoading,
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    toolbar,
    canvasRef,
    artboardWidthPx,
    artboardHeightPx,
    grid,
    handleImagePxChange,
    initialImageTransform,
    saveImageState,
  } = props

  const bgStyle = React.useMemo(() => {
    if (!pageBgEnabled) return undefined
    const hex = pageBgColor.trim()
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
    if (!m) return undefined
    const int = Number.parseInt(m[1], 16)
    const r = (int >> 16) & 255
    const g = (int >> 8) & 255
    const b = int & 255
    const a = Math.max(0, Math.min(100, pageBgOpacity)) / 100
    return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})` } as React.CSSProperties
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
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div className="pointer-events-auto">
            <FloatingToolbar
              tool={toolbar.tool}
              onToolChange={toolbar.setTool}
              onZoomIn={toolbar.actions.zoomIn}
              onZoomOut={toolbar.actions.zoomOut}
              onFit={toolbar.actions.fit}
              onRotate={toolbar.actions.rotate}
              actionsDisabled={toolbar.actionsDisabled}
            />
          </div>
        </div>
        {masterImage && imageStateLoading ? (
          // Keep layout stable without "Loading…" text (per UX requirement).
          <div className="h-full w-full" aria-hidden="true" />
        ) : (
          <ProjectCanvasStage
            ref={canvasRef}
            src={masterImage?.signedUrl}
            alt={masterImage?.name}
            className="h-full w-full"
            panEnabled={toolbar.panEnabled}
            imageDraggable={Boolean(masterImage) && toolbar.imageDraggable}
            artboardWidthPx={artboardWidthPx ?? undefined}
            artboardHeightPx={artboardHeightPx ?? undefined}
            intrinsicWidthPx={
              typeof masterImage?.width_px === "number" && Number.isFinite(masterImage.width_px) ? masterImage.width_px : undefined
            }
            intrinsicHeightPx={
              typeof masterImage?.height_px === "number" && Number.isFinite(masterImage.height_px) ? masterImage.height_px : undefined
            }
            grid={grid ?? null}
            onImageSizeChange={handleImagePxChange}
            initialImageTransform={masterImage ? initialImageTransform : null}
            onImageTransformCommit={masterImage ? saveImageState : undefined}
          />
        )}

        {!masterImage && !masterImageLoading && !masterImageError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto">
              <ProjectImageUploader
                projectId={projectId}
                onUploaded={refreshMasterImage}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

