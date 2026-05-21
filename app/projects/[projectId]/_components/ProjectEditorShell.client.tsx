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
import { deleteMasterImageWithCascade } from "@/lib/api/project-images"
import { computeImagePlacementPx } from "@/lib/editor/image-placement"
import { GEOMETRY_PPI } from "@/lib/editor/units"
import { useCanvasTxMirror } from "@/lib/editor/hooks/use-canvas-tx-mirror"
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
    seedMasterImage,
    deleteBusy,
    deleteError,
    setDeleteError,
  } = useMasterImage(projectId, initialMasterImage)

  const {
    images: projectImages,
    refresh: refreshProjectImages,
    seedImages: seedProjectImages,
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
  // Mobile-only drawer state for the side panels. On `md+` both panels
  // are always-on; this state is ignored there. The Sheet primitive on
  // mobile handles Escape, overlay-click and focus-trap natively — no
  // custom keydown handler needed here.
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const handleToggleLeftPanel = useCallback(() => {
    setLeftPanelOpen((open) => !open)
  }, [])
  const handleToggleRightPanel = useCallback(() => {
    setRightPanelOpen((open) => !open)
  }, [])
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const lastNoWorkingImageMetricRef = useRef("")
  const {
    sourceSnapshot,
    initialImageTransform,
    saveImageState,
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    seededMasterIdRef,
    uploadSyncError,
    restoreOperationError,
    workflowFilterPanelError,
  } = useEditorWorkflowAdapter({
    projectId,
    initialImageState,
    masterImage,
    masterImageLoading,
    masterImageError,
    filterDisplayImageWithoutTrace,
    filterImageLoading,
    filterImageLoadedOnce,
    filterImageError,
    filterImageEmptyReason,
    refreshMasterImage,
    refreshProjectImages,
    refreshFilterImage,
    seedMasterImage,
  })
  const {
    imageTxU,
    initialImageTxU,
    handleImageTransformChange,
    handleNudge,
    clear: clearImageTxU,
  } = useCanvasTxMirror({
    canvasRef,
    activeCanvasImageId,
    initialImageTransform,
  })
  const filterDialog = useFilterDialogSession(filterSourceImage)
  // Trace dialog needs the image's displayed size on the artboard in
  // mm — numerate-grid math runs on display-mm, not source-px. Live
  // canvas tx (post drag/resize) preferred; SSR-seeded tx is the
  // fresh-upload fallback before the canvas reports its first frame;
  // final fallback re-runs the same placement the upload flow uses.
  // Returns null until workspace + source are both ready.
  const traceSourceImage = useMemo(() => {
    if (!filterSourceImage) return null
    if (!artboardWidthPx || !artboardHeightPx) return null
    const MM_PER_INCH = 25.4
    let displayMmW: number
    let displayMmH: number
    const liveW = imageTxU?.w ?? initialImageTxU?.w
    const liveH = imageTxU?.h ?? initialImageTxU?.h
    if (liveW && liveH) {
      displayMmW = (Number(liveW) / 1e6 / GEOMETRY_PPI) * MM_PER_INCH
      displayMmH = (Number(liveH) / 1e6 / GEOMETRY_PPI) * MM_PER_INCH
    } else {
      const placement = computeImagePlacementPx({
        artW: artboardWidthPx,
        artH: artboardHeightPx,
        intrinsicW: filterSourceImage.width_px,
        intrinsicH: filterSourceImage.height_px,
        imageDpi: masterImage?.dpi ?? null,
      })
      if (!placement) return null
      displayMmW = (placement.widthPx / GEOMETRY_PPI) * MM_PER_INCH
      displayMmH = (placement.heightPx / GEOMETRY_PPI) * MM_PER_INCH
    }
    return { ...filterSourceImage, displayMmW, displayMmH }
  }, [
    filterSourceImage,
    artboardWidthPx,
    artboardHeightPx,
    imageTxU?.w,
    imageTxU?.h,
    initialImageTxU?.w,
    initialImageTxU?.h,
    masterImage?.dpi,
  ])
  const traceDialog = useTraceDialogSession(traceSourceImage)
  // Snapshot from `traceDialog.session` carries the stable identity
  // (sourceImageUrl + intrinsic px), but `displayMmW`/`displayMmH`
  // must reflect the *live* canvas mirror so a mid-dialog resize is
  // reflected in the dialog's "image: 178 × 178 mm" header and in
  // the live grid-math (cell count + cut border). Override only the
  // live fields here.
  const liveTraceDialogSource = useMemo(() => {
    if (!traceDialog.session) return null
    if (!traceSourceImage) return traceDialog.session
    return {
      ...traceDialog.session,
      displayMmW: traceSourceImage.displayMmW,
      displayMmH: traceSourceImage.displayMmH,
    }
  }, [traceDialog.session, traceSourceImage])
  const {
    trace,
    traceBaseImage,
    traceLoading,
    isApplyingTrace,
    isClearingTrace,
    handleApplyTrace,
    handleClearTrace,
  } = useTraceHandlers({
    projectId,
    refreshFilterImage,
    refreshMasterImage,
    saveImageState,
    getCurrentImageTx: useCallback(() => {
      if (!imageTxU) return null
      return {
        xPxU: imageTxU.x,
        yPxU: imageTxU.y,
        widthPxU: imageTxU.w,
        heightPxU: imageTxU.h,
        rotationDeg: initialImageTransform?.rotationDeg ?? 0,
      }
    }, [imageTxU, initialImageTransform]),
  })

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

  const {
    selectedImageId,
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
    leftPanelTab,
    sourceReady: editorImageSource.status === "ready",
    selectedNavId,
    setSelectedNavId,
    activeCanvasImageId,
    isCropping: workflow.isCropping,
    onApplyCrop: workflow.applyCrop,
  })

  const handleDeleteMasterImage = useCallback(async () => {
    if (!masterImage?.id) {
      setDeleteError("No master image to delete.")
      return
    }
    try {
      await deleteMasterImageWithCascade(projectId)
      setDeleteOpen(false)
      clearImageTxU()
      // delete_master_with_cascade is an atomic write: on success,
      // every image row (master + derivatives) is gone in the DB. The
      // resulting client state is trivial — null master, empty list.
      // We seed it directly and let the workflow machine pick up the
      // empty source via the existing SOURCE_SNAPSHOT useEffect, just
      // like the upload path does after PR #193.
      //
      // Background refresh is idempotent: empty is the stable fixed
      // point of the cascade, so an eventual refresh just confirms
      // what we already seeded. No UI wait, no 20s workflow timeout.
      workflow.dismissError()
      seedMasterImage(null)
      seedProjectImages([])
      void Promise.allSettled([refreshProjectImages(), refreshFilterImage()])
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete image")
    }
  }, [
    clearImageTxU,
    masterImage?.id,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
    seedMasterImage,
    seedProjectImages,
    setDeleteError,
    setDeleteOpen,
    workflow,
  ])

  const handleRestoreInitialImage = useCallback(async () => {
    if (workflow.isRestoring) return
    workflow.dismissError()
    workflow.restore()
    setRestoreOpen(false)
    toolbar.setTool("object")
  }, [setRestoreOpen, toolbar, workflow])

  // Delete / Backspace → open the existing delete-image confirmation dialog.
  // Arrow keys → nudge active image.
  useEditorKeyboard({
    enabled: true,
    canDelete: Boolean(masterImage),
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
    // Skip the cascade refresh when this masterImage.id arrived via a
    // direct seed from the upload-response. The workflow refresh fired
    // by handleImageUploaded already fans out to refreshProjectImages
    // in parallel — re-running it here would just burn a roundtrip.
    if (seededMasterIdRef.current && seededMasterIdRef.current === masterImage?.id) {
      return
    }
    void refreshProjectImages()
  }, [masterImage?.id, refreshProjectImages, seededMasterIdRef])

  // Canvas source is always the working-copy across all three tabs.
  // Master is an immutable restore source (`guard_master_immutable`),
  // never the canvas-rendered image — see use-canvas-derived-state.ts
  // for the rationale. Tabs differ only in overlays.
  const { canvasImage, traceOverlaySvgUrl } = useCanvasDerivedState({
    leftPanelTab,
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    traceBaseImage,
  })

  // The Trace renders at a smaller crop-derived rect inside the
  // master's bounding box, not at the master's display rect. The
  // server wrote x/y/w/h to `project_image_trace.display_*_px_u`
  // at apply time (centred on the master), so the client is a pure
  // reader here — pull the 4 BigInts and pass them through to the
  // canvas's initial-placement-controller. For master + filter
  // working-copy paths the master's display rect (initialImage-
  // Transform) is correct, so pass it through unchanged. Legacy
  // trace rows (display_width_px_u === "0") also fall through to
  // the master rect — preserves backward compatibility until
  // existing traces are re-applied.
  const canvasInitialImageTransform = useMemo(() => {
    if (!initialImageTransform) return null
    if (!canvasImage || !masterImage) return initialImageTransform
    if (canvasImage.id === masterImage.id) return initialImageTransform
    if (
      canvasImage.id === traceBaseImage?.id &&
      trace?.display_width_px_u &&
      trace.display_width_px_u !== "0"
    ) {
      return {
        ...initialImageTransform,
        xPxU: BigInt(trace.display_x_px_u),
        yPxU: BigInt(trace.display_y_px_u),
        widthPxU: BigInt(trace.display_width_px_u),
        heightPxU: BigInt(trace.display_height_px_u),
      }
    }
    return initialImageTransform
  }, [canvasImage, masterImage, traceBaseImage, trace, initialImageTransform])

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
        leftPanelOpen={leftPanelOpen}
        onToggleLeftPanel={handleToggleLeftPanel}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={handleToggleRightPanel}
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
              masterImage={
                masterImage?.id
                  ? { id: masterImage.id, label: masterImage.name ?? "Image" }
                  : null
              }
              hasGrid={hasGrid}
              onImageUploaded={handleImageUploaded}
              onImageDeleteRequested={requestDeleteImage}
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
              open={leftPanelOpen}
              onOpenChange={setLeftPanelOpen}
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
              grid={grid}
              traceOverlaySvgUrl={traceOverlaySvgUrl}
              traceInteractive={leftPanelTab === "trace" && stageToolbar.tool === "direct"}
              handleImageTransformChange={handleImageTransformChange}
              initialImageTransform={canvasInitialImageTransform}
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
            cascadeFilterCount={filterStack.length}
            cascadeHasTrace={Boolean(trace)}
            panelImageTxU={panelImageTxU}
            workspaceUnit={workspaceUnit ?? "cm"}
            workspaceReady={workspaceReady}
            imagePanelReady={imagePanelReady}
            gridVisible={gridVisible}
            onGridVisibleChange={setGridVisible}
            canvasRef={canvasRef}
            open={rightPanelOpen}
            onOpenChange={setRightPanelOpen}
          />
          <EditorDialogHost
            selectionOpen={filterDialog.selectionOpen}
            filterDialogSource={filterDialogSource}
            onCloseSelection={filterDialog.closeSelection}
            onApplyFilter={handleApplyFilter}
          />
          <EditorTraceDialogHost
            selectionOpen={traceDialog.selectionOpen}
            activeKind={traceDialog.activeKind}
            traceDialogSource={liveTraceDialogSource}
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

