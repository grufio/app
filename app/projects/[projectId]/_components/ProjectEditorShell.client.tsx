"use client"

/**
 * Project editor client orchestrator shell.
 *
 * This module is intentionally colocated with the route so different tabs
 * (Image, Filter, later Colors/Output) can share a stable data-loading contract.
 *
 * NOTE: In this first step, it preserves existing Image tab behavior.
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
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"
import { recoverSelectedNavId } from "@/features/editor/navigation/selection-recovery"
import { cropImageVariant, restoreInitialMasterImage } from "@/lib/api/project-images"
import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { useProjectGrid } from "@/lib/editor/project-grid"
import type { WorkspaceRow } from "@/lib/editor/project-workspace"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import type { ImageState } from "@/lib/editor/use-image-state"
import { useImageState } from "@/lib/editor/use-image-state"
import type { MasterImage } from "@/lib/editor/use-master-image"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProjectImages } from "@/lib/editor/use-project-images"
import type { Project } from "@/lib/editor/use-project"
import { useProject } from "@/lib/editor/use-project"
import { computeRenderableGrid } from "@/services/editor/grid/validation"
import { normalizeWorkspacePageBg, clampOpacityPercent } from "@/services/editor/page-background"
import { mapSelectedNavIdToRightPanelSection } from "@/services/editor/panel-routing"

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

function useEditorInteractionController(args: {
  tool: "select" | "hand" | "crop"
  setTool: (tool: "select" | "hand" | "crop") => void
  selectedNavId: string
  setSelectedNavId: (next: string) => void
  masterImageId: string | null
  cropBusy: boolean
}) {
  const { tool, setTool, selectedNavId, setSelectedNavId, masterImageId, cropBusy } = args
  const prevToolRef = useRef(tool)
  const prevNavIdRef = useRef(selectedNavId)

  useEffect(() => {
    const prevTool = prevToolRef.current
    const prevNavId = prevNavIdRef.current
    const toolChanged = prevTool !== tool
    const navChanged = prevNavId !== selectedNavId
    prevToolRef.current = tool
    prevNavIdRef.current = selectedNavId

    if (tool !== "crop" || cropBusy) return

    const selection = parseNavId(selectedNavId)
    if (selection.kind === "image") return

    // If user changed tree selection away from image while crop is active,
    // leave tree selection as-is and exit crop mode.
    if (navChanged && !toolChanged) {
      setTool("select")
      return
    }

    // If crop tool was explicitly activated from toolbar/shortcut and no image
    // is selected, focus current image automatically.
    if (masterImageId) {
      setSelectedNavId(buildNavId({ kind: "image", imageId: masterImageId }))
      return
    }

    setTool("select")
  }, [cropBusy, masterImageId, selectedNavId, setSelectedNavId, setTool, tool])
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
    updateWorkspacePageBg,
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

  const {
    images: projectImages,
    refresh: refreshProjectImages,
    deleteById: deleteImageById,
    setLockedById: setImageLockedById,
  } = useProjectImages(projectId)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [gridVisible, setGridVisible] = useState(true)
  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)
  const [cropBusy, setCropBusy] = useState(false)

  // Load image-state independent of masterImage loading, so reloads can apply persisted size immediately.
  // Persist is still gated by `masterImage` when wiring `onImageTransformCommit` (see ProjectEditorStage props).
  const { initialImageTransform, imageStateLoading, loadImageState, saveImageState } = useImageState(
    projectId,
    true,
    initialImageState,
    false
  )
  const saveImageStateBound = useCallback(
    async (t: { xPxU?: bigint; yPxU?: bigint; widthPxU: bigint; heightPxU: bigint; rotationDeg: number }) => {
      const imageId = masterImage?.id
      if (!imageId) return
      await saveImageState({ ...t, imageId })
    },
    [masterImage?.id, saveImageState]
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
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (toolbar.tool !== "crop") return
      if (cropBusy) return
      if (e.key === "Escape") {
        e.preventDefault()
        canvasRef.current?.resetCropSelection()
        toolbar.setTool("select")
        return
      }
      if (e.key !== "Enter") return
      e.preventDefault()
      const sourceImageId = masterImage?.id ?? null
      if (!sourceImageId) {
        console.warn("Crop apply blocked: missing source image id")
        return
      }
      const selection = canvasRef.current?.getCropSelection()
      if (!selection?.ok) {
        console.warn("Crop apply blocked", { reason: selection?.reason ?? "not_ready" })
        return
      }
      const rect = selection.rect
      setCropBusy(true)
      try {
        await cropImageVariant({
          projectId,
          sourceImageId,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
        })
        toolbar.setTool("select")
        await refreshMasterImage()
        await refreshProjectImages()
        await loadImageState()
      } finally {
        setCropBusy(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cropBusy, loadImageState, masterImage?.id, projectId, refreshMasterImage, refreshProjectImages, toolbar])

  const autoSelectMasterIdRef = useRef<string | null>(null)

  const selectedImageId = useMemo(() => {
    const selection = parseNavId(selectedNavId)
    if (selection.kind !== "image") return null
    return selection.imageId
  }, [selectedNavId])

  const lockedImageById = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const img of projectImages) out[img.id] = Boolean(img.is_locked)
    return out
  }, [projectImages])

  const toolbarLockImageId = useMemo(() => selectedImageId ?? projectImages[0]?.id ?? null, [projectImages, selectedImageId])
  const toolbarImageLocked = useMemo(
    () => (toolbarLockImageId ? Boolean(lockedImageById[toolbarLockImageId]) : false),
    [lockedImageById, toolbarLockImageId]
  )

  const handleToggleImageLocked = useCallback(
    async (imageId: string, nextLocked: boolean) => {
      const out = await setImageLockedById(imageId, nextLocked)
      if (!out.ok) return { ok: false as const, reason: out.error }
      return { ok: true as const }
    },
    [setImageLockedById]
  )

  const handleToolbarToolChange = useCallback(
    (tool: typeof toolbar.tool) => {
      if (toolbarImageLocked && (tool === "select" || tool === "crop")) return
      toolbar.setTool(tool)
    },
    [toolbar, toolbarImageLocked]
  )

  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (!toolbarImageLocked) return
      if (e.key.toLowerCase() !== "r") return
      // Block rotate shortcut while selected image is locked.
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKeyDownCapture, true)
    return () => window.removeEventListener("keydown", onKeyDownCapture, true)
  }, [toolbarImageLocked])

  useEffect(() => {
    if (!toolbarImageLocked) return
    if (toolbar.tool !== "select" && toolbar.tool !== "crop") return
    toolbar.setTool("hand")
  }, [toolbar, toolbarImageLocked])

  useEditorInteractionController({
    tool: toolbar.tool,
    setTool: handleToolbarToolChange,
    selectedNavId,
    setSelectedNavId,
    masterImageId: masterImage?.id ?? null,
    cropBusy,
  })

  const stageToolbar = useMemo(
    () => ({
      ...toolbar,
      setTool: handleToolbarToolChange,
      selectDisabled: toolbarImageLocked,
      cropDisabled: toolbarImageLocked,
      rotateDisabled: toolbarImageLocked,
      cropEnabled: toolbar.tool === "crop",
      cropBusy,
      imageDraggable: toolbar.tool === "select",
      panEnabled: toolbar.tool === "hand",
    }),
    [cropBusy, handleToolbarToolChange, toolbar, toolbarImageLocked]
  )

  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null
    return projectImages.find((img) => img.id === selectedImageId) ?? null
  }, [projectImages, selectedImageId])
  const imagePanelLocked = useMemo(
    () => (selectedImageId ? Boolean(lockedImageById[selectedImageId]) : false),
    [lockedImageById, selectedImageId]
  )

  const leftPanelImages = useMemo(
    () =>
      projectImages.map((img) => ({
        id: img.id,
        label: img.name ?? "Image",
      })),
    [projectImages]
  )

  const firstImageNavId = useMemo(
    () =>
      projectImages.length > 0 ? buildNavId({ kind: "image", imageId: projectImages[0].id }) : buildNavId({ kind: "artboard" }),
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

  const handleRestoreInitialImage = useCallback(async () => {
    if (restoreBusy) return
    setRestoreError("")
    setRestoreBusy(true)
    try {
      await restoreInitialMasterImage(projectId)
      setRestoreOpen(false)
      toolbar.setTool("select")
      await refreshMasterImage()
      await refreshProjectImages()
      await loadImageState()
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Failed to restore initial image")
    } finally {
      setRestoreBusy(false)
    }
  }, [loadImageState, projectId, refreshMasterImage, refreshProjectImages, restoreBusy, toolbar])

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

  const workspaceRowRef = useRef<WorkspaceRow | null>(workspaceRow)
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
        void updateWorkspacePageBg({
          enabled: next.enabled,
          color: next.color,
          opacity: next.opacity,
        })
      }, 250)
    },
    [updateWorkspacePageBg]
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
    if (!gridVisible) return null
    return computeRenderableGrid({ row: gridRow, spacingXPx, spacingYPx, lineWidthPx })
  }, [gridRow, gridVisible, lineWidthPx, spacingXPx, spacingYPx])

  const handleTitleUpdated = useCallback((nextTitle: string) => setProject({ id: projectId, name: nextTitle }), [projectId, setProject])

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectEditorHeader projectId={projectId} />

      <ProjectEditorLayout>
        <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
          <main className="flex min-w-0 flex-1">
            <ProjectEditorLeftPanel
              projectId={projectId}
              initialTitle={project && project.id === projectId ? project.name : "Untitled"}
              onTitleUpdated={handleTitleUpdated}
              widthRem={leftPanelWidthRem}
              minRem={minPanelRem}
              maxRem={maxPanelRem}
              onWidthRemChange={setLeftPanelWidthRem}
              selectedId={selectedNavId}
              onSelect={setSelectedNavId}
              images={leftPanelImages}
              lockedById={lockedImageById}
              onToggleImageLocked={handleToggleImageLocked}
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
              toolbar={stageToolbar}
              canvasRef={canvasRef}
              artboardWidthPx={artboardWidthPx ?? undefined}
              artboardHeightPx={artboardHeightPx ?? undefined}
              artboardDpi={workspaceDpi ?? undefined}
              grid={grid}
              handleImagePxChange={handleImagePxChange}
              initialImageTransform={initialImageTransform}
              saveImageState={saveImageStateBound}
              pageBgEnabled={pageBgEnabled}
              pageBgColor={pageBgColor}
              pageBgOpacity={pageBgOpacity}
              onCropDblClick={async () => {
                if (toolbar.tool !== "crop") return
                if (cropBusy) return
                const sourceImageId = masterImage?.id ?? null
                if (!sourceImageId) return
                const selection = canvasRef.current?.getCropSelection()
                if (!selection?.ok) return
                const rect = selection.rect
                setCropBusy(true)
                try {
                  await cropImageVariant({
                    projectId,
                    sourceImageId,
                    x: rect.x,
                    y: rect.y,
                    w: rect.w,
                    h: rect.h,
                  })
                  toolbar.setTool("select")
                  await refreshMasterImage()
                  await refreshProjectImages()
                  await loadImageState()
                } finally {
                  setCropBusy(false)
                }
              }}
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
            restoreBusy={restoreBusy}
            restoreError={restoreError}
            onRestoreImage={handleRestoreInitialImage}
            deleteOpen={deleteOpen}
            setDeleteOpen={setDeleteOpen}
            handleDeleteMasterImage={handleDeleteMasterImage}
            onRequestDeleteImage={requestDeleteSelectedImage}
            panelImagePxU={panelImagePxU}
            workspaceUnit={workspaceUnit ?? "cm"}
            workspaceReady={workspaceReady}
            imageStateLoading={imageStateLoading}
            imagePanelReady={imagePanelReady}
            imagePanelLocked={imagePanelLocked}
            gridVisible={gridVisible}
            onGridVisibleChange={setGridVisible}
            canvasRef={canvasRef}
          />
        </EditorErrorBoundary>
      </ProjectEditorLayout>
    </div>
  )
}

