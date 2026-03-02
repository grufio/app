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
import { toast } from "sonner"
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
import { applyProjectImageFilter, cropImageVariant, removeProjectImageFilter, restoreInitialMasterImage } from "@/lib/api/project-images"
import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { useImageWorkflowMachine } from "@/lib/editor/machines/use-image-workflow-machine"
import { reportError } from "@/lib/monitoring/error-reporting"
import { useFilterWorkingImage } from "@/lib/editor/use-filter-working-image"
import { useFilterDialogSession } from "@/lib/editor/use-filter-dialog-session"
import { useEditorSessionState } from "@/lib/editor/use-editor-session-state"
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

type EditorImageSourceState =
  | { status: "loading"; image: null; error: "" }
  | { status: "ready"; image: { id: string; signedUrl: string; width_px: number; height_px: number; name: string }; error: "" }
  | { status: "empty"; image: null; error: "" }
  | { status: "error"; image: null; error: string }

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
    loadedOnce: filterImageLoadedOnce,
    error: filterImageError,
    refresh: refreshFilterImage,
  } = useFilterWorkingImage(projectId)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const {
    state: sessionState,
    actions: sessionActions,
  } = useEditorSessionState()
  const { deleteOpen, leftPanelTab, canvasMode, hiddenFilterIds } = sessionState
  const { setDeleteOpen, setLeftPanelTab, setCanvasMode, showFilter, toggleHiddenFilter, pruneHiddenFilters } = sessionActions
  const [numerateSuperpixelWidth] = useState(10)
  const [numerateSuperpixelHeight] = useState(10)
  const [gridVisible, setGridVisible] = useState(true)
  const [uploadSyncing, setUploadSyncing] = useState(false)
  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const lastFilterErrorToastRef = useRef("")
  const lastNoWorkingImageMetricRef = useRef("")
  const activeSourceImageIdRef = useRef<string | null>(null)
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)
  const sourceSnapshot = useMemo<EditorImageSourceState>(() => {
    if (masterImageLoading || filterImageLoading || uploadSyncing || !filterImageLoadedOnce) {
      return { status: "loading", image: null, error: "" }
    }
    if (filterDisplayImage) {
      return {
        status: "ready",
        image: {
          id: filterDisplayImage.id,
          signedUrl: filterDisplayImage.signedUrl,
          width_px: filterDisplayImage.width_px,
          height_px: filterDisplayImage.height_px,
          name: filterDisplayImage.name,
        },
        error: "",
      }
    }
    if (filterImageError) return { status: "error", image: null, error: filterImageError }
    if (masterImageError) return { status: "error", image: null, error: masterImageError }
    if (masterImage) {
      return {
        status: "error",
        image: null,
        error: "No working image available. Please refresh or restore the image.",
      }
    }
    return { status: "empty", image: null, error: "" }
  }, [
    filterDisplayImage,
    filterImageError,
    filterImageLoadedOnce,
    filterImageLoading,
    masterImage,
    masterImageError,
    masterImageLoading,
    uploadSyncing,
  ])
  useEffect(() => {
    activeSourceImageIdRef.current = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  }, [sourceSnapshot])
  const activeSnapshotImageId = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  const imageStateEnabled = sourceSnapshot.status === "ready"
  const { initialImageTransform, imageStateLoading, loadImageState, saveImageState } = useImageState(
    projectId,
    imageStateEnabled,
    initialImageState,
    false,
    activeSnapshotImageId ?? undefined
  )
  const refreshEditorData = useCallback(async () => {
    await refreshMasterImage()
    await refreshProjectImages()
    await refreshFilterImage()
    await loadImageState()
  }, [loadImageState, refreshFilterImage, refreshMasterImage, refreshProjectImages])
  const removeFilterService = useCallback(
    async (filterId: string) => {
      await removeProjectImageFilter({ projectId, filterId })
    },
    [projectId]
  )
  const applyCropService = useCallback(
    async ({ sourceImageId, rect }: { sourceImageId: string; rect: { x: number; y: number; w: number; h: number } }) => {
      await cropImageVariant({
        projectId,
        sourceImageId,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      })
    },
    [projectId]
  )
  const restoreBaseService = useCallback(async () => {
    await restoreInitialMasterImage(projectId)
  }, [projectId])
  const applyFilterService = useCallback(
    async (args: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) => {
      const sourceImageId = activeSourceImageIdRef.current
      if (!sourceImageId) {
        throw new Error("No active image available for filtering.")
      }
      await applyProjectImageFilter({
        projectId,
        filterType: args.filterType,
        filterParams: {
          source_image_id: sourceImageId,
          ...args.filterParams,
        },
      })
    },
    [projectId]
  )
  const saveTransformService = useCallback(
    async ({ imageId, transform }: { imageId: string; transform: { xPxU?: bigint; yPxU?: bigint; widthPxU: bigint; heightPxU: bigint; rotationDeg: number } }) => {
      await saveImageState({ ...transform, imageId })
    },
    [saveImageState]
  )
  const workflowServices = useMemo(
    () => ({
      removeFilter: removeFilterService,
      applyFilter: applyFilterService,
      applyCrop: applyCropService,
      restoreBase: restoreBaseService,
      refreshAll: refreshEditorData,
      saveTransform: saveTransformService,
    }),
    [applyCropService, applyFilterService, refreshEditorData, removeFilterService, restoreBaseService, saveTransformService]
  )
  const workflow = useImageWorkflowMachine({
    projectId,
    sourceSnapshot,
    services: workflowServices,
  })
  const editorImageSource = workflow.readModel
  const activeCanvasImageId =
    editorImageSource.status === "ready" && editorImageSource.image ? editorImageSource.image.id : null
  const filterSourceImage = useMemo(
    () => (editorImageSource.status === "ready" && editorImageSource.image ? editorImageSource.image : null),
    [editorImageSource]
  )
  const filterDialog = useFilterDialogSession(filterSourceImage)

  const handleFilterApplySuccess = useCallback(() => {
    setCanvasMode("filter")
    filterDialog.reset()
  }, [filterDialog, setCanvasMode])

  const handleFilterApplyError = useCallback(
    (error: Error) => {
      console.error("Failed to apply filter:", error)
    },
    []
  )
  const handleApplyFilter = useCallback(
    async (args: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) => {
      await workflow.applyFilter(args)
    },
    [workflow]
  )
  const handleImageUploaded = useCallback(async () => {
    // Single-entry sync contract after upload: refresh through workflow orchestration only.
    setUploadSyncing(true)
    try {
      await workflow.refreshAndWait()
    } finally {
      setUploadSyncing(false)
    }
  }, [workflow])

  const filterOperationError =
    workflow.lastOperation === "filter_apply" || workflow.lastOperation === "filter_remove" ? workflow.operationError : ""
  const restoreOperationError = workflow.lastOperation === "restore" ? workflow.operationError : ""
  const filterPanelError = filterOperationError || workflow.persistenceError || filterDialog.error || filterImageError
  const filterDialogSource = filterDialog.session
  const activeDisplayFilterId = filterStack[filterStack.length - 1]?.id ?? null
  const isActiveDisplayFilterHidden = activeDisplayFilterId ? Boolean(hiddenFilterIds[activeDisplayFilterId]) : false

  useEffect(() => {
    if (!filterPanelError) {
      lastFilterErrorToastRef.current = ""
      return
    }
    if (lastFilterErrorToastRef.current === filterPanelError) return
    lastFilterErrorToastRef.current = filterPanelError
    toast.error(filterPanelError)
  }, [filterPanelError])

  useEffect(() => {
    const noWorkingImageMessage = "No working image available. Please refresh or restore the image."
    if (sourceSnapshot.status !== "error" || sourceSnapshot.error !== noWorkingImageMessage) {
      lastNoWorkingImageMetricRef.current = ""
      return
    }
    const metricKey = `${projectId}:${sourceSnapshot.error}`
    if (lastNoWorkingImageMetricRef.current === metricKey) return
    lastNoWorkingImageMetricRef.current = metricKey
    void reportError(new Error(noWorkingImageMessage), {
      tags: {
        domain: "image_workflow",
        metric: "no_working_image_available",
      },
      extra: {
        projectId,
        sourceStatus: sourceSnapshot.status,
      },
    })
  }, [projectId, sourceSnapshot])

  useEffect(() => {
    pruneHiddenFilters(new Set(filterStack.map((item) => item.id)))
  }, [filterStack, pruneHiddenFilters])


  const saveImageStateBound = useCallback(async (t: { xPxU?: bigint; yPxU?: bigint; widthPxU: bigint; heightPxU: bigint; rotationDeg: number }) => {
    workflow.saveTransform(t)
  }, [workflow])
  const hasFilterSourceImage = Boolean(filterSourceImage)
  const isNewFilterActionBusy = filterImageLoading || imageStateLoading || workflow.isMutating || workflow.isSyncing
  const newFilterDisabledReason = !hasFilterSourceImage ? "missing_source" : isNewFilterActionBusy ? "busy" : null
  const isNewFilterDisabled = newFilterDisabledReason !== null
  const openFilterSelection = useCallback(() => {
    if (isNewFilterDisabled) return
    workflow.dismissError()
    const opened = filterDialog.beginSelection()
    if (opened) setCanvasMode("filter")
  }, [filterDialog, isNewFilterDisabled, setCanvasMode, workflow])

  const initialImagePxU = useMemo(() => {
    if (!activeCanvasImageId || !initialImageTransform) return null
    const wU = initialImageTransform.widthPxU
    const hU = initialImageTransform.heightPxU
    if (!wU || !hU || wU <= 0n || hU <= 0n) return null
    return { w: wU, h: hU }
  }, [activeCanvasImageId, initialImageTransform])

  const handleImagePxChange = useCallback((w: bigint, h: bigint) => {
    setImagePxU((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev
      return { w, h }
    })
  }, [])

  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: editorImageSource.status === "ready",
    masterImageLoading: editorImageSource.status === "loading",
    imageStateLoading,
    enableShortcuts: canvasMode !== "filter",
  })
  const applyCropSelection = useCallback(async () => {
    if (canvasMode === "filter") return
    if (workflow.isCropping) return
    if (editorImageSource.status !== "ready") return
    const selection = canvasRef.current?.getCropSelection()
    if (!selection?.ok) {
      console.warn("Crop apply blocked", { reason: selection?.reason ?? "not_ready" })
      return
    }
    workflow.applyCrop(selection.rect)
    toolbar.setTool("select")
  }, [
    canvasMode,
    editorImageSource,
    toolbar,
    workflow,
  ])

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (canvasMode === "filter") return
      if (toolbar.tool !== "crop") return
      if (workflow.isCropping) return
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
  }, [applyCropSelection, canvasMode, toolbar, workflow.isCropping])

  const autoSelectMasterIdRef = useRef<string | null>(null)

  const selectedImageId = useMemo(() => {
    const selection = parseNavId(selectedNavId)
    if (selection.kind !== "image") return null
    return selection.imageId
  }, [selectedNavId])

  const derivedCanvasMode = useMemo<"image" | "filter">(() => {
    if (leftPanelTab === "filter" && editorImageSource.status === "ready") return "filter"
    return "image"
  }, [editorImageSource.status, leftPanelTab])

  useEffect(() => {
    if (canvasMode === derivedCanvasMode) return
    setCanvasMode(derivedCanvasMode)
  }, [canvasMode, derivedCanvasMode, setCanvasMode])

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
    masterImageId: activeCanvasImageId,
    cropBusy: workflow.isCropping,
  })

  const stageToolbar = useMemo(
    () => ({
      ...toolbar,
      setTool: handleToolbarToolChange,
      selectDisabled: canvasMode === "filter" || toolbarImageLocked,
      cropDisabled: canvasMode === "filter" || toolbarImageLocked,
      rotateDisabled: canvasMode === "filter" || toolbarImageLocked,
      cropEnabled: canvasMode !== "filter" && toolbar.tool === "crop",
      cropBusy: workflow.isCropping,
      imageDraggable: canvasMode !== "filter" && toolbar.tool === "select",
      panEnabled: canvasMode === "filter" ? true : toolbar.tool === "hand",
    }),
    [canvasMode, handleToolbarToolChange, toolbar, toolbarImageLocked, workflow.isCropping]
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
  }, [deleteImage, deleteImageById, refreshFilterImage, refreshMasterImage, refreshProjectImages, selectedImageId, setDeleteOpen])

  const handleRestoreInitialImage = useCallback(async () => {
    if (workflow.isRestoring) return
    workflow.dismissError()
    workflow.restore()
    setRestoreOpen(false)
    toolbar.setTool("select")
  }, [toolbar, workflow])

  const requestDeleteImage = useCallback(
    async (imageId: string) => {
      setDeleteError("")
      setSelectedNavId(buildNavId({ kind: "image", imageId }))
      setDeleteOpen(true)
    },
    [setDeleteError, setDeleteOpen]
  )

  const requestDeleteSelectedImage = useCallback(() => {
    setDeleteError("")
    setDeleteOpen(true)
  }, [setDeleteError, setDeleteOpen])

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

  const renderModel = useMemo(() => {
    const readyImage = editorImageSource.status === "ready" ? editorImageSource.image : null
    const baseImage = readyImage
      ? {
          id: readyImage.id,
          signedUrl: readyImage.signedUrl,
          name: readyImage.name,
          width_px: readyImage.width_px,
          height_px: readyImage.height_px,
          dpi: null,
          restore_base: null,
        }
      : null
    return { baseImage }
  }, [editorImageSource])

  const stageImage = useMemo(() => {
    return renderModel.baseImage
  }, [renderModel])

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
                onClick={() => {
                  showFilter(filter.id)
                  setCanvasMode("filter")
                }}
              >
                <SlidersHorizontal />
                <span>{getFilterLabel(filter.filterType)}</span>
              </SidebarMenuButton>
              <SidebarMenuActions>
                <SidebarMenuAction
                  inline
                  aria-label={hiddenFilterIds[filter.id] ? "Show filter" : "Hide filter"}
                  onClick={() => toggleHiddenFilter(filter.id)}
                >
                  {hiddenFilterIds[filter.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </SidebarMenuAction>
                <SidebarMenuAction
                  inline
                  aria-label="Remove filter"
                  disabled={workflow.isRemovingFilter}
                  onClick={() => workflow.removeFilter(filter.id)}
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
                disabled={isNewFilterDisabled}
              onClick={openFilterSelection}
            >
              <SlidersHorizontal />
              <span>New Filter</span>
            </SidebarMenuButton>
            <SidebarMenuAction
              aria-label="Add filter"
              disabled={isNewFilterDisabled}
              onClick={openFilterSelection}
            >
              <Plus />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
      </EditorSidebarSection>
    ),
    [
      canvasMode,
      filterStack,
      hiddenFilterIds,
      isNewFilterDisabled,
      isActiveDisplayFilterHidden,
      activeDisplayFilterId,
      openFilterSelection,
      setCanvasMode,
      showFilter,
      toggleHiddenFilter,
      workflow,
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
              onImageUploaded={handleImageUploaded}
              onImageDeleteRequested={requestDeleteImage}
              onGridCreateRequested={requestCreateGrid}
              onGridDeleteRequested={requestDeleteGrid}
              filterPanelContent={filterSidebarContent}
            />
            <ProjectEditorStage
              projectId={projectId}
              masterImage={stageImage}
              masterImageLoading={editorImageSource.status === "loading"}
              masterImageError={editorImageSource.status === "error" ? editorImageSource.error : ""}
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
            restoreBusy={workflow.isRestoring}
            restoreError={restoreOperationError}
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
                workingImageWidth={filterDialogSource.sourceImageWidth}
                workingImageHeight={filterDialogSource.sourceImageHeight}
                open={filterDialog.activeFilterType === "pixelate"}
                onClose={filterDialog.closeConfigure}
                onSuccess={handleFilterApplySuccess}
                onError={handleFilterApplyError}
                onApplyFilter={handleApplyFilter}
              />
              <LineArtFilterController
                open={filterDialog.activeFilterType === "lineart"}
                onClose={filterDialog.closeConfigure}
                onSuccess={handleFilterApplySuccess}
                onError={handleFilterApplyError}
                onApplyFilter={handleApplyFilter}
              />
              <NumerateFilterController
                superpixelWidth={numerateSuperpixelWidth}
                superpixelHeight={numerateSuperpixelHeight}
                open={filterDialog.activeFilterType === "numerate"}
                onClose={filterDialog.closeConfigure}
                onSuccess={handleFilterApplySuccess}
                onError={handleFilterApplyError}
                onApplyFilter={handleApplyFilter}
              />
            </>
          ) : null}
        </EditorErrorBoundary>
      </ProjectEditorLayout>
    </div>
  )
}

