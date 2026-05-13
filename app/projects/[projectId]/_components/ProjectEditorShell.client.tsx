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
import { FilterSidebarSection } from "@/features/editor/components/filter-sidebar-section"
import { TraceSidebarSection } from "@/features/editor/components/trace-sidebar-section"
import type { OperationError } from "@/lib/api/operation-error"
import { useDedupingErrorToast } from "@/lib/editor/hooks/use-deduping-error-toast"
import { useFilterStackActions } from "@/lib/editor/hooks/use-filter-stack-actions"
import { useTraceHandlers } from "./editor-shell/use-trace-handlers"
import { useCanvasDerivedState } from "./editor-shell/use-canvas-derived-state"
import { useFilterWorkingImage } from "@/lib/editor/hooks/use-filter-working-image"
import { useEditorKeyboard } from "@/lib/editor/hooks/use-editor-keyboard"
import { useMutationLeaveGuard } from "@/lib/editor/hooks/use-mutation-leave-guard"
import { shouldWarnBeforeUnload } from "@/lib/editor/hooks/should-warn-before-unload"
import { useFilterDialogSession } from "@/lib/editor/hooks/use-filter-dialog-session"
import { useTraceDialogSession } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useEditorSessionState } from "@/lib/editor/hooks/use-editor-session-state"
import { usePageBackgroundState } from "@/lib/editor/hooks/use-page-background-state"
import { useProjectGrid } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { reportError } from "@/lib/monitoring/error-reporting"
import type { ImageState } from "@/lib/editor/hooks/use-image-state"
import type { MasterImage } from "@/lib/editor/hooks/use-master-image"
import { useMasterImage } from "@/lib/editor/hooks/use-master-image"
import { useProjectImages } from "@/lib/editor/hooks/use-project-images"
import type { Project } from "@/lib/editor/hooks/use-project"
import { useProject } from "@/lib/editor/hooks/use-project"
import { computeRenderableGrid } from "@/services/editor/grid/validation"
import { useRightPanelModel } from "./editor-shell/use-right-panel-model"
import { useStageInteractionPolicy } from "./editor-shell/use-stage-interaction-policy"
import { useEditorWorkflowAdapter } from "./editor-shell/use-editor-workflow-adapter"
import { EditorDialogHost } from "./editor-shell/editor-dialog-host"
import { EditorTraceDialogHost } from "./editor-shell/editor-trace-dialog-host"
import { useLeftPanelModel } from "./editor-shell/use-left-panel-model"
import { isStaleSelectionDeleteError, resolveDeleteTargetImageId } from "./editor-shell/delete-target"

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
  } = useProjectImages(projectId)
  const {
    image: filterDisplayImage,
    imageWithoutTrace: filterDisplayImageWithoutTrace,
    stack: filterStack,
    loading: filterImageLoading,
    loadedOnce: filterImageLoadedOnce,
    error: filterImageError,
    emptyReason: filterImageEmptyReason,
    refresh: refreshFilterImage,
  } = useFilterWorkingImage(projectId)

  const {
    state: sessionState,
    actions: sessionActions,
  } = useEditorSessionState()
  const { restoreOpen, deleteOpen, leftPanelTab, hiddenFilterIds } = sessionState
  const { setRestoreOpen, setDeleteOpen, setLeftPanelTab, showFilter, hideFilter, toggleHiddenFilter, pruneHiddenFilters } = sessionActions
  const [gridVisible, setGridVisible] = useState(true)
  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const lastNoWorkingImageMetricRef = useRef("")
  const [imageTxU, setImageTxU] = useState<{ x: bigint; y: bigint; w: bigint; h: bigint } | null>(null)
  const {
    sourceSnapshot,
    initialImageTransform,
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    uploadSyncError,
    restoreOperationError,
    workflowFilterPanelError,
  } = useEditorWorkflowAdapter({
    projectId,
    initialImageState,
    masterImage,
    masterImageLoading,
    masterImageError,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    filterImageLoading,
    filterImageLoadedOnce,
    filterImageError,
    filterImageEmptyReason,
    refreshMasterImage,
    refreshProjectImages,
    refreshFilterImage,
  })
  const filterDialog = useFilterDialogSession(filterSourceImage)
  const traceDialog = useTraceDialogSession(filterSourceImage)
  const {
    trace,
    traceLoading,
    isApplyingTrace,
    isClearingTrace,
    handleApplyTrace,
    handleClearTrace,
  } = useTraceHandlers({ projectId, refreshFilterImage, refreshMasterImage })

  // PR-6b-3b: `workflowFilterPanelError` is OperationError | null;
  // `filterDialog.error` is still a string. Coerce + null-safe pick.
  const filterPanelError: OperationError | null =
    workflowFilterPanelError ?? (filterDialog.error ? { stage: "unknown", message: filterDialog.error } : null)
  const filterDialogSource = filterDialog.session
  const activeDisplayFilterId = filterStack[filterStack.length - 1]?.id ?? null
  const isActiveDisplayFilterHidden = activeDisplayFilterId ? Boolean(hiddenFilterIds[activeDisplayFilterId]) : false

  useDedupingErrorToast(filterPanelError)
  useDedupingErrorToast(uploadSyncError)

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

  const { toggleHidden: handleToggleHidden } = useFilterStackActions({
    filterStack,
    projectId,
    refreshFilterImage,
    toggleHiddenFilter,
    showFilter,
    hideFilter,
    pruneHiddenFilters,
  })

  const hasFilterSourceImage = Boolean(filterSourceImage)
  const isNewFilterActionBusy = filterImageLoading || workflow.isMutating || workflow.isSyncing
  const isAddFilterDisabled = !hasFilterSourceImage || isNewFilterActionBusy
  const openFilterSelection = useCallback(() => {
    if (isAddFilterDisabled) return
    workflow.dismissError()
    filterDialog.beginSelection()
  }, [filterDialog, isAddFilterDisabled, workflow])

  const isAddTraceDisabled = !hasFilterSourceImage || isNewFilterActionBusy || isApplyingTrace || isClearingTrace
  const openTraceSelection = useCallback(() => {
    if (isAddTraceDisabled) return
    traceDialog.beginSelection()
  }, [isAddTraceDisabled, traceDialog])

  const initialImageTxU = useMemo(() => {
    if (!activeCanvasImageId || !initialImageTransform) return null
    const wU = initialImageTransform.widthPxU
    const hU = initialImageTransform.heightPxU
    if (!wU || !hU || wU <= 0n || hU <= 0n) return null
    return {
      x: initialImageTransform.xPxU ?? 0n,
      y: initialImageTransform.yPxU ?? 0n,
      w: wU,
      h: hU,
    }
  }, [activeCanvasImageId, initialImageTransform])

  const handleImageTransformChange = useCallback((tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => {
    setImageTxU((prev) => {
      if (!tx) return null
      const next = { x: tx.xPxU, y: tx.yPxU, w: tx.widthPxU, h: tx.heightPxU }
      if (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h) return prev
      return next
    })
  }, [])

  const {
    selectedImageId,
    leftPanelImages,
    requestDeleteImage,
    requestDeleteSelectedImage,
    requestCreateGrid,
    requestDeleteGrid,
  } = useLeftPanelModel({
    selectedNavId,
    setSelectedNavId,
    projectImages,
    masterImageId: masterImage?.id ?? null,
    setDeleteError,
    setDeleteOpen,
    createGrid,
    deleteGrid,
  })

  const canvasMode = useMemo<"image" | "filter">(() => {
    if (leftPanelTab === "filter" && editorImageSource.status === "ready") return "filter"
    return "image"
  }, [editorImageSource.status, leftPanelTab])

  const { toolbar, stageToolbar, applyCropSelection } = useStageInteractionPolicy({
    canvasRef,
    canvasMode,
    leftPanelTab,
    sourceReady: editorImageSource.status === "ready",
    selectedNavId,
    setSelectedNavId,
    activeCanvasImageId,
    isCropping: workflow.isCropping,
    onApplyCrop: workflow.applyCrop,
  })

  const handleDeleteMasterImage = useCallback(async () => {
    const targetId = resolveDeleteTargetImageId({
      selectedImageId,
      projectImages,
      activeImageId: displayTarget.active_image_id,
    })
    if (!targetId) {
      setDeleteError("No active image available for delete.")
      return
    }

    const res = await deleteImageById(targetId)
    if (!res.ok) {
      if (isStaleSelectionDeleteError(res.error)) {
        await refreshProjectImages()
      }
      setDeleteError(res.error)
      return
    }
    setDeleteOpen(false)
    setImageTxU(null)
    await workflow.refreshAndWait()
  }, [deleteImageById, displayTarget.active_image_id, projectImages, refreshProjectImages, selectedImageId, setDeleteError, setDeleteOpen, workflow])

  const handleRestoreInitialImage = useCallback(async () => {
    if (workflow.isRestoring) return
    workflow.dismissError()
    workflow.restore()
    setRestoreOpen(false)
    toolbar.setTool("object")
  }, [setRestoreOpen, toolbar, workflow])

  // Arrow-key nudge handler. Reads current image transform off the
  // imageTxU state and dispatches a setImagePosition with the delta.
  // The keyboard hook's `isEditableTarget` check ensures arrow keys in
  // text inputs still move the caret rather than the image.
  const handleNudge = useCallback(
    (dxPx: number, dyPx: number) => {
      if (!imageTxU) return
      const dxPxU = BigInt(Math.round(dxPx)) * 1_000_000n
      const dyPxU = BigInt(Math.round(dyPx)) * 1_000_000n
      canvasRef.current?.setImagePosition({
        xPxU: imageTxU.x + dxPxU,
        yPxU: imageTxU.y + dyPxU,
      })
    },
    [imageTxU],
  )

  // Delete / Backspace → open the existing delete-image confirmation dialog.
  // Arrow keys → nudge active image.
  useEditorKeyboard({
    enabled: true,
    canDelete: displayTarget.deletable,
    onDelete: requestDeleteSelectedImage,
    onNudge: handleNudge,
  })

  // Warn before tab close / external nav while a server-side mutation
  // is in flight (filter-apply, crop, restore). Otherwise the server
  // side may finish, the client never reconciles, and a stale
  // filter_working_copy row + storage object are left behind for the
  // eventual-consistent cleanup. Internal Next.js nav stays inside the
  // editor and isn't blocked.
  useMutationLeaveGuard({
    active: shouldWarnBeforeUnload({
      mutationInFlight:
        workflow.isApplyingFilter || workflow.isCropping || workflow.isRestoring,
      filterDialogConfiguring: filterDialog.activeFilterType !== null,
      traceDialogConfiguring: traceDialog.activeKind !== null,
    }),
  })

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

  const { panelImageTxU, workspaceReady, imagePanelReady, activeRightSection, panelImageMeta } = useRightPanelModel({
    selectedNavId,
    imageTxU,
    initialImageTxU,
    workspaceLoading,
    workspaceUnit,
    masterImage,
    projectImages,
    selectedImageId,
  })

  useEffect(() => {
    void refreshProjectImages()
  }, [masterImage?.id, refreshProjectImages])

  // Canvas source is always the working-copy across all three tabs.
  // Master is an immutable restore source (`guard_master_immutable`),
  // never the canvas-rendered image — see use-canvas-derived-state.ts
  // for the rationale. Tabs differ only in overlays.
  const { canvasImage, traceOverlaySvgUrl } = useCanvasDerivedState({
    leftPanelTab,
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
  })

  const grid = useMemo(() => {
    if (!gridVisible) return null
    return computeRenderableGrid({ row: gridRow, spacingXPx, spacingYPx, lineWidthPx })
  }, [gridRow, gridVisible, lineWidthPx, spacingXPx, spacingYPx])

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
              hasGrid={hasGrid}
              onImageUploaded={handleImageUploaded}
              onImageDeleteRequested={requestDeleteImage}
              canDeleteActiveImage={displayTarget.deletable}
              deleteTargetImageId={displayTarget.active_image_id}
              onGridCreateRequested={requestCreateGrid}
              onGridDeleteRequested={requestDeleteGrid}
              filterPanelContent={
                <FilterSidebarSection
                  filterStack={filterStack}
                  canvasMode={canvasMode}
                  hiddenFilterIds={hiddenFilterIds}
                  isAddFilterDisabled={isAddFilterDisabled}
                  activeDisplayFilterId={activeDisplayFilterId}
                  isActiveDisplayFilterHidden={isActiveDisplayFilterHidden}
                  isRemovingFilter={workflow.isRemovingFilter}
                  isLoadingInitial={filterImageLoading && !filterImageLoadedOnce}
                  onSelectFilter={showFilter}
                  onToggleHidden={handleToggleHidden}
                  onRemoveFilter={workflow.removeFilter}
                  onOpenSelection={openFilterSelection}
                />
              }
              tracePanelContent={
                <TraceSidebarSection
                  trace={trace ? { kind: trace.kind } : null}
                  isAddTraceDisabled={isAddTraceDisabled}
                  isClearingTrace={isClearingTrace}
                  isLoadingInitial={traceLoading}
                  onClearTrace={handleClearTrace}
                  onOpenSelection={openTraceSelection}
                />
              }
            />
            <ProjectEditorStage
              projectId={projectId}
              masterImage={canvasImage}
              masterImageLoading={editorImageSource.status === "loading"}
              masterImageError={editorImageSource.status === "error" ? editorImageSource.error : ""}
              toolbar={stageToolbar}
              canvasRef={canvasRef}
              artboardWidthPx={artboardWidthPx ?? undefined}
              artboardHeightPx={artboardHeightPx ?? undefined}
              artboardDpi={workspaceDpi ?? undefined}
              grid={grid}
              traceOverlaySvgUrl={traceOverlaySvgUrl}
              traceInteractive={leftPanelTab === "trace" && stageToolbar.tool === "direct"}
              handleImageTransformChange={handleImageTransformChange}
              initialImageTransform={initialImageTransform}
              saveImageState={workflow.saveTransform}
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
            panelImageTxU={panelImageTxU}
            workspaceUnit={workspaceUnit ?? "cm"}
            workspaceReady={workspaceReady}
            imagePanelReady={imagePanelReady}
            gridVisible={gridVisible}
            onGridVisibleChange={setGridVisible}
            canvasRef={canvasRef}
          />
          <EditorDialogHost
            selectionOpen={filterDialog.selectionOpen}
            activeFilterType={filterDialog.activeFilterType}
            filterDialogSource={filterDialogSource}
            onCloseSelection={filterDialog.closeSelection}
            onSelectFilterType={filterDialog.selectFilterType}
            onCloseConfigure={filterDialog.closeConfigure}
            onApplied={filterDialog.reset}
            onApplyFilter={handleApplyFilter}
          />
          <EditorTraceDialogHost
            selectionOpen={traceDialog.selectionOpen}
            activeKind={traceDialog.activeKind}
            traceDialogSource={traceDialog.session}
            onCloseSelection={traceDialog.closeSelection}
            onSelectKind={traceDialog.selectKind}
            onCloseConfigure={traceDialog.closeConfigure}
            onApplied={traceDialog.reset}
            onApplyTrace={handleApplyTrace}
          />
        </EditorErrorBoundary>
      </ProjectEditorLayout>
    </div>
  )
}

