"use client"

import * as React from "react"

import { ProjectImageUploader } from "@/components/app-img-upload"
import { FloatingToolbar, ProjectCanvasStage, type ProjectCanvasStageHandle } from "@/components/shared/editor"

export function ProjectEditorStage(props: {
  projectId: string
  masterImage: { signedUrl?: string | null; name?: string | null } | null
  masterImageLoading: boolean
  masterImageError: string
  refreshMasterImage: () => void | Promise<void>
  imageStateLoading: boolean
  toolbar: {
    tool: string
    setTool: (t: any) => void
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
  handleImagePxChange: (w: bigint, h: bigint) => void
  initialImageTransform: unknown
  saveImageState?: (v: unknown) => void | Promise<void>
}) {
  const {
    projectId,
    masterImage,
    masterImageLoading,
    masterImageError,
    refreshMasterImage,
    imageStateLoading,
    toolbar,
    canvasRef,
    artboardWidthPx,
    artboardHeightPx,
    handleImagePxChange,
    initialImageTransform,
    saveImageState,
  } = props

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* status/errors (no centering; keep it out of the canvas area) */}
      {masterImageError ? (
        <div className="px-6 pt-4">
          <div className="text-sm text-destructive">{masterImageError}</div>
        </div>
      ) : null}

      {/* Workspace */}
      <div className="relative min-h-0 flex-1">
        {/* Floating toolbar overlay (Figma-like) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div className="pointer-events-auto">
            <FloatingToolbar
              tool={toolbar.tool as any}
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
            onImageSizeChange={handleImagePxChange}
            initialImageTransform={masterImage ? (initialImageTransform as any) : null}
            onImageTransformCommit={masterImage ? (saveImageState as any) : undefined}
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

