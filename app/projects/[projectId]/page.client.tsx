"use client"

/**
 * Project editor client orchestrator.
 *
 * Responsibilities:
 * - Wire workspace/grid/image state hooks into editor UI panels and canvas.
 * - Maintain view/UI state that is not persisted in the database.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { type ProjectCanvasStageHandle, ProjectEditorHeader } from "@/components/shared/editor"
import { EditorErrorBoundary } from "@/components/shared/editor/editor-error-boundary"
import { ProjectEditorLayout } from "@/components/project-editor/ProjectEditorLayout"
import { ProjectEditorLeftPanel } from "@/components/project-editor/ProjectEditorLeftPanel"
import { ProjectEditorRightPanel } from "@/components/project-editor/ProjectEditorRightPanel"
import { ProjectEditorStage } from "@/components/project-editor/ProjectEditorStage"
import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { type WorkspaceRow, useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useProjectGrid } from "@/lib/editor/project-grid"
import type { MasterImage } from "@/lib/editor/use-master-image"
import { useMasterImage } from "@/lib/editor/use-master-image"
import type { Project } from "@/lib/editor/use-project"
import { useProject } from "@/lib/editor/use-project"
import type { ImageState } from "@/lib/editor/use-image-state"
import { useImageState } from "@/lib/editor/use-image-state"

export function ProjectDetailPageClient({
  projectId,
  initialProject,
  initialMasterImage,
  initialImageState,
}: {
  projectId: string
  initialProject: Project | null
  initialMasterImage: MasterImage | null
  initialImageState: ImageState | null
}) {
  const {
    row: workspaceRow,
    upsertWorkspace,
    unit: workspaceUnit,
    dpi: workspaceDpi,
    widthPx: artboardWidthPx,
    heightPx: artboardHeightPx,
    loading: workspaceLoading,
  } = useProjectWorkspace()
  const { row: gridRow, spacingXPx, spacingYPx, lineWidthPx } = useProjectGrid()

  const { project, setProject } = useProject(projectId, initialProject)
  const {
    masterImage,
    masterImageLoading,
    masterImageError,
    refreshMasterImage,
    deleteBusy,
    deleteError,
    setDeleteError,
    deleteImage,
  } = useMasterImage(projectId, initialMasterImage)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)

  // Load image-state independent of masterImage loading, so reloads can apply persisted size immediately.
  // Persist is still gated by `masterImage` when wiring `onImageTransformCommit` (see ProjectEditorStage props).
  const { initialImageTransform, imageStateLoading, saveImageState } = useImageState(projectId, true, initialImageState)

  const initialImagePxU = useMemo(() => {
    if (!masterImage || !initialImageTransform) return null
    const wU = initialImageTransform.widthPxU
    const hU = initialImageTransform.heightPxU
    if (!wU || !hU || wU <= 0n || hU <= 0n) return null
    return { w: wU, h: hU }
  }, [initialImageTransform, masterImage])

  const handleImagePxChange = useCallback((w: bigint, h: bigint) => {
    setImagePxU((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev
      return { w, h }
    })
  }, [])

  const handleDeleteMasterImage = useCallback(async () => {
    const res = await deleteImage()
    if (!res.ok) return
    setDeleteOpen(false)
    setImagePxU(null)
  }, [deleteImage])

  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: Boolean(masterImage),
    masterImageLoading,
    imageStateLoading,
    enableShortcuts: true,
  })

  const [selectedNavId, setSelectedNavId] = useState<string>("app")

  const [leftPanelWidthRem, setLeftPanelWidthRem] = useState(20)
  const [rightPanelWidthRem, setRightPanelWidthRem] = useState(20)
  const minPanelRem = 18
  const maxPanelRem = 24

  const [pageBgEnabled, setPageBgEnabled] = useState(false)
  const [pageBgColor, setPageBgColor] = useState("#ffffff")
  const [pageBgOpacity, setPageBgOpacity] = useState(50)

  const workspaceRowRef = useRef(workspaceRow)
  useEffect(() => {
    workspaceRowRef.current = workspaceRow
  }, [workspaceRow])

  const pageBgInitKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!workspaceRow) return
    // Initialize once per project load (avoid overwriting user edits mid-session).
    if (pageBgInitKeyRef.current === workspaceRow.project_id) return
    pageBgInitKeyRef.current = workspaceRow.project_id
    setPageBgEnabled(Boolean(workspaceRow.page_bg_enabled ?? false))
    setPageBgColor(typeof workspaceRow.page_bg_color === "string" ? workspaceRow.page_bg_color : "#ffffff")
    const op = Number(workspaceRow.page_bg_opacity ?? 50)
    setPageBgOpacity(Math.max(0, Math.min(100, Number.isFinite(op) ? op : 50)))
  }, [workspaceRow])

  const bgSaveTimerRef = useRef<number | null>(null)
  const scheduleSavePageBg = useCallback(
    (next: { enabled: boolean; color: string; opacity: number }) => {
      const base = workspaceRowRef.current
      if (!base) return
      const merged: WorkspaceRow = {
        ...base,
        page_bg_enabled: next.enabled,
        page_bg_color: next.color,
        page_bg_opacity: next.opacity,
      }
      if (bgSaveTimerRef.current != null) window.clearTimeout(bgSaveTimerRef.current)
      bgSaveTimerRef.current = window.setTimeout(() => {
        bgSaveTimerRef.current = null
        void upsertWorkspace(merged)
      }, 250)
    },
    [upsertWorkspace]
  )

  useEffect(() => {
    return () => {
      if (bgSaveTimerRef.current != null) window.clearTimeout(bgSaveTimerRef.current)
    }
  }, [])

  const panelImagePxU = useMemo(() => {
    if (imageStateLoading) return null
    return imagePxU ?? initialImagePxU ?? null
  }, [imagePxU, imageStateLoading, initialImagePxU])

  const workspaceReady = computeWorkspaceReady({
    workspaceLoading,
    workspaceUnit,
    workspaceDpi,
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    masterImage,
    imageStateLoading,
    panelImagePxU,
  })

  const activeRightSection = selectedNavId.startsWith("app/api") ? "image" : "artboard"

  const grid = useMemo(() => {
    if (!gridRow) return null
    if (!Number.isFinite(spacingXPx ?? NaN) || !Number.isFinite(spacingYPx ?? NaN) || !Number.isFinite(lineWidthPx ?? NaN)) return null
    const spacingX = Number(spacingXPx)
    const spacingY = Number(spacingYPx)
    const lw = Number(lineWidthPx)
    if (spacingX <= 0 || spacingY <= 0 || lw <= 0) return null
    return { spacingXPx: spacingX, spacingYPx: spacingY, lineWidthPx: lw, color: gridRow.color }
  }, [gridRow, lineWidthPx, spacingXPx, spacingYPx])

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectEditorHeader
        projectId={projectId}
        initialTitle={project && project.id === projectId ? project.name : "Untitled"}
        onTitleUpdated={(nextTitle) => setProject({ id: projectId, name: nextTitle })}
      />

      <ProjectEditorLayout>
        <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
          <main className="flex min-w-0 flex-1">
            <ProjectEditorLeftPanel
              widthRem={leftPanelWidthRem}
              minRem={minPanelRem}
              maxRem={maxPanelRem}
              onWidthRemChange={setLeftPanelWidthRem}
              selectedId={selectedNavId}
              onSelect={setSelectedNavId}
            />
            <ProjectEditorStage
              projectId={projectId}
              masterImage={masterImage}
              masterImageLoading={masterImageLoading}
              masterImageError={masterImageError}
              refreshMasterImage={refreshMasterImage}
              imageStateLoading={imageStateLoading}
              toolbar={toolbar}
              canvasRef={canvasRef}
              artboardWidthPx={artboardWidthPx ?? undefined}
              artboardHeightPx={artboardHeightPx ?? undefined}
              grid={grid}
              handleImagePxChange={handleImagePxChange}
              initialImageTransform={initialImageTransform}
              saveImageState={saveImageState}
              pageBgEnabled={pageBgEnabled}
              pageBgColor={pageBgColor}
              pageBgOpacity={pageBgOpacity}
            />
          </main>

          <ProjectEditorRightPanel
            panelWidthRem={rightPanelWidthRem}
            minPanelRem={minPanelRem}
            maxPanelRem={maxPanelRem}
            onPanelWidthRemChange={setRightPanelWidthRem}
            activeSection={activeRightSection}
            pageBgEnabled={pageBgEnabled}
            pageBgColor={pageBgColor}
            pageBgOpacity={pageBgOpacity}
            onPageBgEnabledChange={(v) => {
              setPageBgEnabled(v)
              scheduleSavePageBg({ enabled: v, color: pageBgColor, opacity: pageBgOpacity })
            }}
            onPageBgColorChange={(c) => {
              const enabled = true
              setPageBgColor(c)
              setPageBgEnabled(enabled)
              scheduleSavePageBg({ enabled, color: c, opacity: pageBgOpacity })
            }}
            onPageBgOpacityChange={(o) => {
              const enabled = true
              const clamped = Math.max(0, Math.min(100, Number.isFinite(o) ? o : 0))
              setPageBgOpacity(clamped)
              setPageBgEnabled(enabled)
              scheduleSavePageBg({ enabled, color: pageBgColor, opacity: clamped })
            }}
            masterImage={masterImage}
            masterImageLoading={masterImageLoading}
            deleteBusy={deleteBusy}
            deleteError={deleteError}
            setDeleteError={setDeleteError}
            restoreOpen={restoreOpen}
            setRestoreOpen={setRestoreOpen}
            deleteOpen={deleteOpen}
            setDeleteOpen={setDeleteOpen}
            handleDeleteMasterImage={handleDeleteMasterImage}
            panelImagePxU={panelImagePxU}
            workspaceUnit={workspaceUnit ?? "cm"}
            workspaceDpi={workspaceDpi ?? 300}
            workspaceReady={workspaceReady}
            imageStateLoading={imageStateLoading}
            imagePanelReady={imagePanelReady}
            canvasRef={canvasRef}
          />
        </EditorErrorBoundary>
      </ProjectEditorLayout>
    </div>
  )
}

