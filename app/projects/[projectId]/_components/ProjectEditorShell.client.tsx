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
import { toast } from "sonner"

import {
  EditorErrorBoundary,
  ProjectEditorHeader,
  ProjectEditorLayout,
  ProjectEditorLeftPanel,
  ProjectEditorRightPanel,
  ProjectEditorStage,
  type ProjectCanvasStageHandle,
} from "@/features/editor"
import { buildNavId } from "@/features/editor/navigation/nav-id"
import { recoverSelectedNavId } from "@/features/editor/navigation/selection-recovery"
import { FilterSidebarSection } from "@/features/editor/components/filter-sidebar-section"
import { useFilterWorkingImage } from "@/lib/editor/use-filter-working-image"
import { useFilterDialogSession } from "@/lib/editor/use-filter-dialog-session"
import { useEditorSessionState } from "@/lib/editor/use-editor-session-state"
import { usePageBackgroundState } from "@/lib/editor/use-page-background-state"
import { useProjectGrid } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import type { ImageState } from "@/lib/editor/use-image-state"
import type { MasterImage } from "@/lib/editor/use-master-image"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProjectImages } from "@/lib/editor/use-project-images"
import type { Project } from "@/lib/editor/use-project"
import { useProject } from "@/lib/editor/use-project"
import { computeRenderableGrid } from "@/services/editor/grid/validation"
import { useRightPanelModel } from "./editor-shell/use-right-panel-model"
import { useStageInteractionPolicy } from "./editor-shell/use-stage-interaction-policy"
import { useEditorWorkflowAdapter } from "./editor-shell/use-editor-workflow-adapter"
import { EditorDialogHost } from "./editor-shell/editor-dialog-host"
import { useLeftPanelModel } from "./editor-shell/use-left-panel-model"
import { useImageStateLoadOrchestration } from "./editor-shell/use-image-state-load-orchestration"

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
  } = useMasterImage(projectId, initialMasterImage)

  const {
    images: projectImages,
    displayTarget,
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
    emptyReason: filterImageEmptyReason,
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
  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const lastFilterErrorToastRef = useRef("")
  const lastNoWorkingImageMetricRef = useRef("")
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)
  const {
    sourceSnapshot,
    initialImageTransform,
    imageStateLoading,
    loadImageState,
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    restoreOperationError,
    workflowFilterPanelError,
  } = useEditorWorkflowAdapter({
    projectId,
    initialImageState,
    masterImage,
    masterImageLoading,
    masterImageError,
    filterDisplayImage,
    filterImageLoading,
    filterImageLoadedOnce,
    filterImageError,
    filterImageEmptyReason,
    refreshMasterImage,
    refreshProjectImages,
    refreshFilterImage,
  })
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
  const filterPanelError = workflowFilterPanelError || filterDialog.error
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
    const unresolvedSourceMessage = "Working image target is unresolved. Refresh editor state."
    if (sourceSnapshot.status !== "error" || sourceSnapshot.error !== unresolvedSourceMessage) {
      lastNoWorkingImageMetricRef.current = ""
      return
    }
    const metricKey = `${projectId}:${sourceSnapshot.error}`
    if (lastNoWorkingImageMetricRef.current === metricKey) return
    lastNoWorkingImageMetricRef.current = metricKey
    void reportError(new Error(unresolvedSourceMessage), {
      scope: "editor",
      code: "WORKFLOW_SOURCE_MISSING",
      stage: "source_snapshot",
      severity: "warn",
      tags: {
        domain: "image_workflow",
        metric: "working_image_target_unresolved",
      },
      context: {
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
  const isAddFilterDisabled = !hasFilterSourceImage || isNewFilterActionBusy
  const openFilterSelection = useCallback(() => {
    if (isAddFilterDisabled) return
    workflow.dismissError()
    const opened = filterDialog.beginSelection()
    if (opened) setCanvasMode("filter")
  }, [filterDialog, isAddFilterDisabled, setCanvasMode, workflow])

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

  const autoSelectMasterIdRef = useRef<string | null>(null)

  const {
    selectedImageId,
    lockedImageById,
    leftPanelImages,
    handleToggleImageLocked,
    requestDeleteImage,
    requestDeleteSelectedImage,
    requestCreateGrid,
    requestDeleteGrid,
  } = useLeftPanelModel({
    selectedNavId,
    setSelectedNavId,
    projectImages,
    setImageLockedById,
    setDeleteError,
    setDeleteOpen,
    createGrid,
    deleteGrid,
  })

  const derivedCanvasMode = useMemo<"image" | "filter">(() => {
    if (leftPanelTab === "filter" && editorImageSource.status === "ready") return "filter"
    return "image"
  }, [editorImageSource.status, leftPanelTab])

  useEffect(() => {
    if (canvasMode === derivedCanvasMode) return
    setCanvasMode(derivedCanvasMode)
  }, [canvasMode, derivedCanvasMode, setCanvasMode])

  const { toolbar, stageToolbar, applyCropSelection } = useStageInteractionPolicy({
    canvasRef,
    canvasMode,
    imageStateLoading,
    sourceReady: editorImageSource.status === "ready",
    selectedNavId,
    setSelectedNavId,
    activeCanvasImageId,
    selectedImageId,
    projectImages,
    lockedImageById,
    isCropping: workflow.isCropping,
    onApplyCrop: workflow.applyCrop,
  })

  const handleDeleteMasterImage = useCallback(async () => {
    const targetId = selectedImageId ?? displayTarget.active_image_id
    if (!targetId) {
      setDeleteError("No active image available for delete.")
      return
    }

    const res = await deleteImageById(targetId)
    if (!res.ok) {
      setDeleteError(res.error)
      return
    }
    setDeleteOpen(false)
    setImagePxU(null)
    await refreshProjectImages()
    await refreshMasterImage()
    await refreshFilterImage()
  }, [deleteImageById, displayTarget.active_image_id, refreshFilterImage, refreshMasterImage, refreshProjectImages, selectedImageId, setDeleteError, setDeleteOpen])

  const handleRestoreInitialImage = useCallback(async () => {
    if (workflow.isRestoring) return
    workflow.dismissError()
    workflow.restore()
    setRestoreOpen(false)
    toolbar.setTool("select")
  }, [toolbar, workflow])

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

  const { panelImagePxU, workspaceReady, imagePanelReady, imagePanelLocked, activeRightSection, panelImageMeta } = useRightPanelModel({
    selectedNavId,
    imageStateLoading,
    imagePxU,
    initialImagePxU,
    workspaceLoading,
    workspaceUnit,
    masterImage,
    projectImages,
    selectedImageId,
    lockedImageById,
  })

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
      <FilterSidebarSection
        filterStack={filterStack}
        canvasMode={canvasMode}
        hiddenFilterIds={hiddenFilterIds}
        isAddFilterDisabled={isAddFilterDisabled}
        activeDisplayFilterId={activeDisplayFilterId}
        isActiveDisplayFilterHidden={isActiveDisplayFilterHidden}
        isRemovingFilter={workflow.isRemovingFilter}
        onSelectFilter={(filterId) => {
          showFilter(filterId)
          setCanvasMode("filter")
        }}
        onToggleHidden={toggleHiddenFilter}
        onRemoveFilter={workflow.removeFilter}
        onOpenSelection={openFilterSelection}
      />
    ),
    [
      canvasMode,
      filterStack,
      hiddenFilterIds,
      isAddFilterDisabled,
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
              canDeleteActiveImage={displayTarget.deletable}
              deleteTargetImageId={displayTarget.active_image_id}
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
            canDeleteActiveImage={displayTarget.deletable}
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
          <EditorDialogHost
            selectionOpen={filterDialog.selectionOpen}
            activeFilterType={filterDialog.activeFilterType}
            filterDialogSource={filterDialogSource}
            numerateSuperpixelWidth={numerateSuperpixelWidth}
            numerateSuperpixelHeight={numerateSuperpixelHeight}
            onCloseSelection={filterDialog.closeSelection}
            onSelectFilterType={filterDialog.selectFilterType}
            onCloseConfigure={filterDialog.closeConfigure}
            onSuccess={handleFilterApplySuccess}
            onError={handleFilterApplyError}
            onApplyFilter={handleApplyFilter}
          />
        </EditorErrorBoundary>
      </ProjectEditorLayout>
    </div>
  )
}

