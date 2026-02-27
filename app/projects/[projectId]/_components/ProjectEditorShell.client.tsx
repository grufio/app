"use client"

/**
 * Project editor client orchestrator shell.
 *
 * This module is intentionally colocated with the route so editor areas
 * (Image, Filters, later Colors/Output) can share a stable data-loading contract.
 *
 * NOTE: In this first step, it preserves existing Image tab behavior.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eye, EyeOff, Plus, SlidersHorizontal, Trash2 } from "lucide-react"
import { SidebarMenu, SidebarMenuAction, SidebarMenuActions, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

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
import { LineArtFilterController } from "@/features/editor/components/LineArtFilterController"
import { NumerateFilterController } from "@/features/editor/components/NumerateFilterController"
import { PixelateFilterController } from "@/features/editor/components/PixelateFilterController"
import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"
import { cropImageVariant, removeProjectImageFilter, restoreInitialMasterImage } from "@/lib/api/project-images"
import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { useFilterWorkingImage } from "@/lib/editor/use-filter-working-image"
import { useFilterDialogSession } from "@/lib/editor/use-filter-dialog-session"
import { usePageBackgroundState } from "@/lib/editor/use-page-background-state"
import { useProjectGrid } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import type { ImageState } from "@/lib/editor/use-image-state"
import { useImageState } from "@/lib/editor/use-image-state"
import type { MasterImage } from "@/lib/editor/use-master-image"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProjectImages } from "@/lib/editor/use-project-images"
import type { Project } from "@/lib/editor/use-project"
import { useProject } from "@/lib/editor/use-project"
import { computeRenderableGrid } from "@/services/editor/grid/validation"
import { mapSelectedNavIdToRightPanelSection } from "@/services/editor/panel-routing"

function useImageStateLoadOrchestration(args: {
  imageId: string | null
  loadImageState: () => Promise<void>
}) {
  const { imageId, loadImageState } = args
  const loadedImageStateForImageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!imageId) {
      loadedImageStateForImageIdRef.current = null
      return
    }
    if (loadedImageStateForImageIdRef.current === imageId) return
    loadedImageStateForImageIdRef.current = imageId
    void loadImageState()
  }, [imageId, loadImageState])
}

function getFilterLabel(filterType: string): string {
  switch (filterType) {
    case "pixelate":
      return "Pixelate"
    case "lineart":
      return "Line Art"
    case "numerate":
      return "Numerate"
    default:
      return "Filter"
  }
}

function useFilterCommands(args: {
  projectId: string
  setCanvasMode: (mode: "image" | "filter") => void
  refreshFilterImage: () => Promise<void>
}) {
  const { projectId, setCanvasMode, refreshFilterImage } = args
  const [removingFilter, setRemovingFilter] = useState(false)
  const [filterActionError, setFilterActionError] = useState("")

  const handleRemoveFilter = useCallback(
    async (filterId: string) => {
      if (removingFilter) return
      setRemovingFilter(true)
      setFilterActionError("")
      setCanvasMode("filter")
      try {
        await removeProjectImageFilter({ projectId, filterId })
        await refreshFilterImage()
      } catch (e) {
        setFilterActionError(e instanceof Error ? e.message : "Failed to remove filter")
      } finally {
        setRemovingFilter(false)
      }
    },
    [projectId, refreshFilterImage, removingFilter, setCanvasMode]
  )

  const handleFilterSuccess = useCallback(async () => {
    await refreshFilterImage()
    setCanvasMode("filter")
  }, [refreshFilterImage, setCanvasMode])

  return {
    removingFilter,
    filterActionError,
    setFilterActionError,
    handleRemoveFilter,
    handleFilterSuccess,
  }
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
  const {
    image: filterDisplayImage,
    stack: filterStack,
    loading: filterImageLoading,
    error: filterImageError,
    refresh: refreshFilterImage,
  } = useFilterWorkingImage(projectId)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leftPanelTab, setLeftPanelTab] = useState<"image" | "filter" | "colors" | "output">("image")
  const [canvasMode, setCanvasMode] = useState<"image" | "filter">("image")
  const [hiddenFilterIds, setHiddenFilterIds] = useState<Record<string, true>>({})
  const [numerateSuperpixelWidth] = useState(10)
  const [numerateSuperpixelHeight] = useState(10)
  const [gridVisible, setGridVisible] = useState(true)
  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)
  const [cropBusy, setCropBusy] = useState(false)
  const activeCanvasImageId = canvasMode === "filter" ? (filterDisplayImage?.id ?? null) : (masterImage?.id ?? null)
  const { removingFilter, filterActionError, setFilterActionError, handleRemoveFilter, handleFilterSuccess } = useFilterCommands({
    projectId,
    setCanvasMode,
    refreshFilterImage,
  })
  const filterDialog = useFilterDialogSession(filterDisplayImage)
  const openFilterSelection = useCallback(() => {
    setFilterActionError("")
    const opened = filterDialog.beginSelection()
    if (opened) setCanvasMode("filter")
  }, [filterDialog, setCanvasMode, setFilterActionError])

  const handleFilterApplySuccess = useCallback(async () => {
    setCanvasMode("filter")
    await handleFilterSuccess()
    filterDialog.reset()
  }, [filterDialog, handleFilterSuccess])

  const handleFilterApplyError = useCallback(
    (error: Error) => {
      setFilterActionError(error.message || "Failed to apply filter")
    },
    [setFilterActionError]
  )

  const filterPanelError = filterActionError || filterDialog.error
  const filterDialogSource = filterDialog.session
  const activeDisplayFilterId = filterStack[filterStack.length - 1]?.id ?? null
  const isActiveDisplayFilterHidden = activeDisplayFilterId ? Boolean(hiddenFilterIds[activeDisplayFilterId]) : false

  useEffect(() => {
    setHiddenFilterIds((prev) => {
      const validIds = new Set(filterStack.map((item) => item.id))
      let changed = false
      const next: Record<string, true> = {}
      for (const id of Object.keys(prev)) {
        if (validIds.has(id)) next[id] = true
        else changed = true
      }
      return changed ? next : prev
    })
  }, [filterStack])


  // Load image-state independent of masterImage loading, so reloads can apply persisted size immediately.
  // Persist is still gated by `masterImage` when wiring `onImageTransformCommit` (see ProjectEditorStage props).
  const { initialImageTransform, imageStateLoading, loadImageState, saveImageState } = useImageState(
    projectId,
    true,
    initialImageState,
    false,
    activeCanvasImageId ?? undefined
  )
  const saveImageStateBound = useCallback(
    async (t: { xPxU?: bigint; yPxU?: bigint; widthPxU: bigint; heightPxU: bigint; rotationDeg: number }) => {
      if (canvasMode === "filter") return
      const imageId = masterImage?.id
      if (!imageId) return
      await saveImageState({ ...t, imageId })
    },
    [canvasMode, masterImage?.id, saveImageState]
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
    hasImage: Boolean(canvasMode === "filter" && !isActiveDisplayFilterHidden ? filterDisplayImage : masterImage),
    masterImageLoading: canvasMode === "filter" && !isActiveDisplayFilterHidden ? filterImageLoading : masterImageLoading,
    imageStateLoading,
    enableShortcuts: canvasMode !== "filter",
  })
  const applyCropSelection = useCallback(async () => {
    if (canvasMode === "filter") return
    if (cropBusy) return
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
      await refreshFilterImage()
      await loadImageState()
    } finally {
      setCropBusy(false)
    }
  }, [
    canvasMode,
    cropBusy,
    loadImageState,
    masterImage?.id,
    projectId,
    refreshFilterImage,
    refreshMasterImage,
    refreshProjectImages,
    toolbar,
  ])

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (canvasMode === "filter") return
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
      await applyCropSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [applyCropSelection, canvasMode, cropBusy, toolbar])

  const autoSelectMasterIdRef = useRef<string | null>(null)

  const selectedImageId = useMemo(() => {
    const selection = parseNavId(selectedNavId)
    if (selection.kind !== "image") return null
    return selection.imageId
  }, [selectedNavId])

  useEffect(() => {
    // Any explicit selection from the project tree means "Image workspace" mode.
    // While the Filter tab is active, do not force-switch back to image mode.
    // This avoids stale selection updates overriding freshly applied filter results.
    if (leftPanelTab === "filter" || canvasMode === "filter") return
    setCanvasMode("image")
  }, [canvasMode, leftPanelTab, selectedNavId])

  useEffect(() => {
    // In Filter tab, canvas must stay in filter mode when a display image exists.
    // This prevents selection-driven state drift that otherwise requires a manual
    // click on a filter row to re-enter filter mode.
    if (leftPanelTab !== "filter") return
    if (!filterDisplayImage) return
    if (canvasMode === "filter") return
    setCanvasMode("filter")
  }, [canvasMode, filterDisplayImage, leftPanelTab])

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
      if (canvasMode === "filter" && (tool === "select" || tool === "crop")) {
        toolbar.setTool("hand")
        return
      }
      if (toolbarImageLocked && (tool === "select" || tool === "crop")) return
      toolbar.setTool(tool)
    },
    [canvasMode, toolbar, toolbarImageLocked]
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
    if (canvasMode === "filter") {
      if (toolbar.tool !== "hand") toolbar.setTool("hand")
      return
    }
    if (!toolbarImageLocked) return
    if (toolbar.tool !== "select" && toolbar.tool !== "crop") return
    toolbar.setTool("hand")
  }, [canvasMode, toolbar, toolbarImageLocked])

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
      selectDisabled: canvasMode === "filter" || toolbarImageLocked,
      cropDisabled: canvasMode === "filter" || toolbarImageLocked,
      rotateDisabled: canvasMode === "filter" || toolbarImageLocked,
      cropEnabled: canvasMode !== "filter" && toolbar.tool === "crop",
      cropBusy,
      imageDraggable: canvasMode !== "filter" && toolbar.tool === "select",
      panEnabled: canvasMode === "filter" ? true : toolbar.tool === "hand",
    }),
    [canvasMode, cropBusy, handleToolbarToolChange, toolbar, toolbarImageLocked]
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
    await refreshProjectImages()
    await refreshMasterImage()
    await refreshFilterImage()
  }, [deleteImage, deleteImageById, refreshFilterImage, refreshMasterImage, refreshProjectImages, selectedImageId])

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
      await refreshFilterImage()
      await loadImageState()
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Failed to restore initial image")
    } finally {
      setRestoreBusy(false)
    }
  }, [loadImageState, projectId, refreshFilterImage, refreshMasterImage, refreshProjectImages, restoreBusy, toolbar])

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

  const {
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    handlePageBgEnabledChange,
    handlePageBgColorChange,
    handlePageBgOpacityChange,
  } = usePageBackgroundState({
    workspaceRow,
    updateWorkspacePageBg,
  })

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

  useEffect(() => {
    void refreshProjectImages()
  }, [masterImage?.id, refreshProjectImages])

  useImageStateLoadOrchestration({
    imageId: activeCanvasImageId,
    loadImageState,
  })

  const stageImage = useMemo(() => {
    if (canvasMode === "filter") {
      if (isActiveDisplayFilterHidden) return masterImage
      if (filterDisplayImage) {
        return {
          id: filterDisplayImage.id,
          signedUrl: filterDisplayImage.signedUrl,
          name: filterDisplayImage.name,
          width_px: filterDisplayImage.width_px,
          height_px: filterDisplayImage.height_px,
          dpi: null,
          restore_base: null,
        }
      }
      return masterImage
    }
    return masterImage
  }, [canvasMode, filterDisplayImage, isActiveDisplayFilterHidden, masterImage])

  useEffect(() => {
    if (canvasMode === "filter" && !filterDisplayImage) {
      setCanvasMode("image")
    }
  }, [canvasMode, filterDisplayImage])

  const grid = useMemo(() => {
    if (!gridVisible) return null
    return computeRenderableGrid({ row: gridRow, spacingXPx, spacingYPx, lineWidthPx })
  }, [gridRow, gridVisible, lineWidthPx, spacingXPx, spacingYPx])

  const filterSidebarContent = useMemo(
    () => (
      <EditorSidebarSection title="Filter">
        <SidebarMenu>
          {filterStack.map((filter) => (
            <SidebarMenuItem key={filter.id}>
              <SidebarMenuButton
                isActive={canvasMode === "filter" && !isActiveDisplayFilterHidden && activeDisplayFilterId === filter.id}
                className="text-xs font-medium"
                onClick={() => setCanvasMode("filter")}
              >
                <SlidersHorizontal />
                <span>{getFilterLabel(filter.filterType)}</span>
              </SidebarMenuButton>
              <SidebarMenuActions>
                <SidebarMenuAction
                  inline
                  aria-label={hiddenFilterIds[filter.id] ? "Show filter" : "Hide filter"}
                  onClick={() => {
                    setHiddenFilterIds((prev) => {
                      const next = { ...prev }
                      if (next[filter.id]) delete next[filter.id]
                      else next[filter.id] = true
                      return next
                    })
                  }}
                >
                  {hiddenFilterIds[filter.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </SidebarMenuAction>
                <SidebarMenuAction
                  inline
                  aria-label="Remove filter"
                  disabled={removingFilter}
                  onClick={() => void handleRemoveFilter(filter.id)}
                >
                  <Trash2 />
                </SidebarMenuAction>
              </SidebarMenuActions>
            </SidebarMenuItem>
          ))}

          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={canvasMode === "filter" && filterStack.length === 0}
              className="text-xs font-medium"
              disabled={filterImageLoading || imageStateLoading || !filterDisplayImage}
                onClick={openFilterSelection}
            >
              <SlidersHorizontal />
              <span>New Filter</span>
            </SidebarMenuButton>
            <SidebarMenuAction
              aria-label="Add filter"
              disabled={filterImageLoading || imageStateLoading || !filterDisplayImage}
                onClick={openFilterSelection}
            >
              <Plus />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
        {filterPanelError ? <div className="mt-2 text-xs text-destructive">{filterPanelError}</div> : null}
      </EditorSidebarSection>
    ),
    [
      canvasMode,
      filterPanelError,
      filterDisplayImage,
      filterImageLoading,
      filterStack,
      hiddenFilterIds,
      handleRemoveFilter,
      imageStateLoading,
      isActiveDisplayFilterHidden,
      activeDisplayFilterId,
      openFilterSelection,
      removingFilter,
    ]
  )

  const handleTitleUpdated = useCallback((nextTitle: string) => setProject({ id: projectId, name: nextTitle }), [projectId, setProject])

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
              activeTab={leftPanelTab}
              onActiveTabChange={setLeftPanelTab}
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
              filterPanelContent={filterSidebarContent}
            />
            <ProjectEditorStage
              projectId={projectId}
              masterImage={stageImage}
              masterImageLoading={canvasMode === "filter" ? filterImageLoading : masterImageLoading}
              masterImageError={canvasMode === "filter" ? filterImageError : masterImageError}
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
                await applyCropSelection()
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
          <FilterSelectionController
            workingImageUrl={filterDialogSource?.sourceImageUrl ?? null}
            open={filterDialog.selectionOpen}
            onClose={filterDialog.closeSelection}
            onSelect={(filterType) => {
              filterDialog.selectFilterType(filterType)
            }}
          />
          {filterDialogSource ? (
            <>
              <PixelateFilterController
                projectId={projectId}
                workingImageId={filterDialogSource.sourceImageId}
                workingImageWidth={filterDialogSource.sourceImageWidth}
                workingImageHeight={filterDialogSource.sourceImageHeight}
                open={filterDialog.activeFilterType === "pixelate"}
                onClose={filterDialog.closeConfigure}
                onSuccess={handleFilterApplySuccess}
                onError={handleFilterApplyError}
              />
              <LineArtFilterController
                projectId={projectId}
                workingImageId={filterDialogSource.sourceImageId}
                open={filterDialog.activeFilterType === "lineart"}
                onClose={filterDialog.closeConfigure}
                onSuccess={handleFilterApplySuccess}
                onError={handleFilterApplyError}
              />
              <NumerateFilterController
                projectId={projectId}
                workingImageId={filterDialogSource.sourceImageId}
                superpixelWidth={numerateSuperpixelWidth}
                superpixelHeight={numerateSuperpixelHeight}
                open={filterDialog.activeFilterType === "numerate"}
                onClose={filterDialog.closeConfigure}
                onSuccess={handleFilterApplySuccess}
                onError={handleFilterApplyError}
              />
            </>
          ) : null}
        </EditorErrorBoundary>
      </ProjectEditorLayout>
    </div>
  )
}

