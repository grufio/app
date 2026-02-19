"use client"

/**
 * Project editor client orchestrator.
 *
 * Responsibilities:
 * - Wire workspace/grid/image state hooks into editor UI panels and canvas.
 * - Maintain view/UI state that is not persisted in the database.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  EditorErrorBoundary,
  ProjectEditorHeader,
  ProjectEditorLayout,
  ProjectEditorLeftPanel,
  ProjectEditorRightPanel,
  ProjectEditorStage,
  type ProjectCanvasStageHandle,
} from "@/features/editor"
import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { type WorkspaceRow, useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useProjectGrid } from "@/lib/editor/project-grid"
import type { MasterImage } from "@/lib/editor/use-master-image"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProjectImages } from "@/lib/editor/use-project-images"
import type { Project } from "@/lib/editor/use-project"
import { useProject } from "@/lib/editor/use-project"
import type { ImageState } from "@/lib/editor/use-image-state"
import { useImageState } from "@/lib/editor/use-image-state"
import { computeRenderableGrid } from "@/services/editor/grid/validation"
import { clampOpacityPercent, normalizeWorkspacePageBg } from "@/services/editor/page-background"
import { mapSelectedNavIdToRightPanelSection } from "@/services/editor/panel-routing"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"
import { recoverSelectedNavId } from "@/features/editor/navigation/selection-recovery"

function useMasterImageLoadOrchestration({
  masterImageId,
  refreshProjectImages,
  loadImageState,
}: {
  masterImageId: string | null
  refreshProjectImages: () => Promise<void>
  loadImageState: () => Promise<void>
}) {
  const loadedImageStateForImageIdRef = useRef<string | null>(null)

  useEffect(() => {
    void refreshProjectImages()
  }, [masterImageId, refreshProjectImages])

  useEffect(() => {
    if (!masterImageId) {
      loadedImageStateForImageIdRef.current = null
      return
    }
    if (loadedImageStateForImageIdRef.current === masterImageId) return
    loadedImageStateForImageIdRef.current = masterImageId
    void loadImageState()
  }, [loadImageState, masterImageId])
}

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
  const { row: gridRow, hasGrid, createGrid, deleteGrid, spacingXPx, spacingYPx, lineWidthPx } = useProjectGrid()

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

  const { images: projectImages, refresh: refreshProjectImages, deleteById: deleteImageById } = useProjectImages(projectId)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)

  // Load image-state independent of masterImage loading, so reloads can apply persisted size immediately.
  // Persist is still gated by `masterImage` when wiring `onImageTransformCommit` (see ProjectEditorStage props).
  const { initialImageTransform, imageStateLoading, loadImageState, saveImageState } = useImageState(
    projectId,
    true,
    initialImageState,
    false
  )

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

  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: Boolean(masterImage),
    masterImageLoading,
    imageStateLoading,
    enableShortcuts: true,
  })

  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  const autoSelectMasterIdRef = useRef<string | null>(null)

  const selectedImageId = useMemo(() => {
    const selection = parseNavId(selectedNavId)
    if (selection.kind !== "image") return null
    return selection.imageId
  }, [selectedNavId])

  useEffect(() => {
    // Keep left-panel image selection and toolbar "select" mode in sync:
    // selecting an image in the tree should immediately show selection frame.
    if (!selectedImageId) return
    if (toolbar.tool === "select") return
    toolbar.setTool("select")
  }, [selectedImageId, toolbar])

  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null
    return projectImages.find((img) => img.id === selectedImageId) ?? null
  }, [projectImages, selectedImageId])

  const leftPanelImages = useMemo(
    () =>
      projectImages.map((img) => ({
        id: img.id,
        label: img.name ?? "Image",
      })),
    [projectImages]
  )

  const firstImageNavId = useMemo(
    () => (projectImages.length > 0 ? buildNavId({ kind: "image", imageId: projectImages[0].id }) : buildNavId({ kind: "artboard" })),
    [projectImages]
  )

  const handleDeleteMasterImage = useCallback(async () => {
    const res = selectedImageId ? await deleteImageById(selectedImageId) : await deleteImage()
    if (!res.ok) return
    setDeleteOpen(false)
    setImagePxU(null)
    void refreshProjectImages()
    void refreshMasterImage()
  }, [deleteImage, deleteImageById, refreshMasterImage, refreshProjectImages, selectedImageId])

  const requestDeleteImage = useCallback(
    async (imageId: string) => {
      setDeleteError("")
      setSelectedNavId(buildNavId({ kind: "image", imageId }))
      setDeleteOpen(true)
    },
    [setDeleteError]
  )

  const requestDeleteSelectedImage = useCallback(() => {
    setDeleteError("")
    setDeleteOpen(true)
  }, [setDeleteError])

  const requestCreateGrid = useCallback(async () => {
    const out = await createGrid()
    if (!out) return
    setSelectedNavId(buildNavId({ kind: "grid" }))
  }, [createGrid])

  const requestDeleteGrid = useCallback(async () => {
    const ok = await deleteGrid()
    if (!ok) return
    setSelectedNavId(firstImageNavId)
  }, [deleteGrid, firstImageNavId])

  const [leftPanelWidthRem, setLeftPanelWidthRem] = useState(20)
  const [rightPanelWidthRem, setRightPanelWidthRem] = useState(20)
  const minPanelRem = 18
  const maxPanelRem = 24

  const [pageBgEnabled, setPageBgEnabled] = useState(false)
  const [pageBgColor, setPageBgColor] = useState("#ffffff")
  const [pageBgOpacity, setPageBgOpacity] = useState(50)

  const pageBgRef = useRef<{ enabled: boolean; color: string; opacity: number }>({
    enabled: pageBgEnabled,
    color: pageBgColor,
    opacity: pageBgOpacity,
  })
  useEffect(() => {
    pageBgRef.current = { enabled: pageBgEnabled, color: pageBgColor, opacity: pageBgOpacity }
  }, [pageBgColor, pageBgEnabled, pageBgOpacity])

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
    const normalized = normalizeWorkspacePageBg(workspaceRow)
    setPageBgEnabled(normalized.enabled)
    setPageBgColor(normalized.color)
    setPageBgOpacity(normalized.opacity)
  }, [workspaceRow])

  const bgSaveTimerRef = useRef<number | null>(null)
  const scheduleSavePageBg = useCallback(
    (next: { enabled: boolean; color: string; opacity: number }) => {
      if (bgSaveTimerRef.current != null) window.clearTimeout(bgSaveTimerRef.current)
      bgSaveTimerRef.current = window.setTimeout(() => {
        bgSaveTimerRef.current = null
        const base = workspaceRowRef.current
        if (!base) return
        const merged: WorkspaceRow = {
          ...base,
          page_bg_enabled: next.enabled,
          page_bg_color: next.color,
          page_bg_opacity: next.opacity,
        }
        void upsertWorkspace(merged)
      }, 250)
    },
    [upsertWorkspace]
  )

  const handlePageBgEnabledChange = useCallback(
    (enabled: boolean) => {
      setPageBgEnabled(enabled)
      const { color, opacity } = pageBgRef.current
      scheduleSavePageBg({ enabled, color, opacity })
    },
    [scheduleSavePageBg]
  )

  const handlePageBgColorChange = useCallback(
    (color: string) => {
      const enabled = true
      const { opacity } = pageBgRef.current
      setPageBgColor(color)
      setPageBgEnabled(enabled)
      scheduleSavePageBg({ enabled, color, opacity })
    },
    [scheduleSavePageBg]
  )

  const handlePageBgOpacityChange = useCallback(
    (opacityPercent: number) => {
      const enabled = true
      const clamped = clampOpacityPercent(opacityPercent, 0)
      const { color } = pageBgRef.current
      setPageBgOpacity(clamped)
      setPageBgEnabled(enabled)
      scheduleSavePageBg({ enabled, color, opacity: clamped })
    },
    [scheduleSavePageBg]
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
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    masterImage,
    imageStateLoading,
    panelImagePxU,
  })

  const activeRightSection = mapSelectedNavIdToRightPanelSection(selectedNavId)

  const panelImageMeta = useMemo(() => {
    if (!selectedImage) return masterImage
    return {
      signedUrl: masterImage?.signedUrl ?? null,
      name: selectedImage.name ?? "Image",
    }
  }, [masterImage, selectedImage])

  useEffect(() => {
    const masterImageId = masterImage?.id ?? null
    setSelectedNavId((prev) => {
      let next = prev
      if (!masterImageId) {
        autoSelectMasterIdRef.current = null
      } else if (autoSelectMasterIdRef.current !== masterImageId) {
        autoSelectMasterIdRef.current = masterImageId
        const artboardId = buildNavId({ kind: "artboard" })
        if (next === artboardId) {
          next = buildNavId({ kind: "image", imageId: masterImageId })
        }
      }
      return recoverSelectedNavId({
        selectedNavId: next,
        images: projectImages,
        activeMasterImageId: masterImageId,
      })
    })
  }, [masterImage?.id, projectImages])

  useMasterImageLoadOrchestration({
    masterImageId: masterImage?.id ?? null,
    refreshProjectImages,
    loadImageState,
  })

  const grid = useMemo(() => {
    return computeRenderableGrid({ row: gridRow, spacingXPx, spacingYPx, lineWidthPx })
  }, [gridRow, lineWidthPx, spacingXPx, spacingYPx])

  const handleTitleUpdated = useCallback(
    (nextTitle: string) => setProject({ id: projectId, name: nextTitle }),
    [projectId, setProject]
  )

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectEditorHeader
        projectId={projectId}
        initialTitle={project && project.id === projectId ? project.name : "Untitled"}
        onTitleUpdated={handleTitleUpdated}
      />

      <ProjectEditorLayout>
        <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
          <main className="flex min-w-0 flex-1">
            <ProjectEditorLeftPanel
              projectId={projectId}
              widthRem={leftPanelWidthRem}
              minRem={minPanelRem}
              maxRem={maxPanelRem}
              onWidthRemChange={setLeftPanelWidthRem}
              selectedId={selectedNavId}
              onSelect={setSelectedNavId}
              images={leftPanelImages}
              hasGrid={hasGrid}
              onImageUploaded={refreshMasterImage}
              onImageDeleteRequested={requestDeleteImage}
              onGridCreateRequested={requestCreateGrid}
              onGridDeleteRequested={requestDeleteGrid}
            />
            <ProjectEditorStage
              projectId={projectId}
              masterImage={masterImage}
              masterImageLoading={masterImageLoading}
              masterImageError={masterImageError}
              imageStateLoading={imageStateLoading}
              toolbar={toolbar}
              canvasRef={canvasRef}
              artboardWidthPx={artboardWidthPx ?? undefined}
              artboardHeightPx={artboardHeightPx ?? undefined}
              artboardDpi={workspaceDpi ?? undefined}
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
            onPageBgEnabledChange={handlePageBgEnabledChange}
            onPageBgColorChange={handlePageBgColorChange}
            onPageBgOpacityChange={handlePageBgOpacityChange}
            masterImage={panelImageMeta}
            masterImageLoading={masterImageLoading}
            deleteBusy={deleteBusy}
            deleteError={deleteError}
            setDeleteError={setDeleteError}
            restoreOpen={restoreOpen}
            setRestoreOpen={setRestoreOpen}
            deleteOpen={deleteOpen}
            setDeleteOpen={setDeleteOpen}
            handleDeleteMasterImage={handleDeleteMasterImage}
            onRequestDeleteImage={requestDeleteSelectedImage}
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

