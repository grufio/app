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
import { TraceVisibilitySection } from "@/features/editor/components/trace-visibility-section"
import type { OperationError } from "@/lib/api/operation-error"
import { deleteMasterImageWithCascade } from "@/lib/api/project-images"
import { displayTxToMm } from "@/lib/editor/trace/display-tx-to-mm"
import { useDisplaySize } from "@/lib/editor/hooks/use-display-size"
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
import type { ImageState } from "@/lib/editor/imageState"
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
  const { restoreOpen, deleteOpen, leftPanelTab, hiddenFilterIds, traceOverlayVisible, previewBitmapVisible, numbersLayerVisible } = sessionState
  const { setRestoreOpen, setDeleteOpen, setLeftPanelTab, showFilter, hideFilter, toggleHiddenFilter, pruneHiddenFilters, setTraceOverlayVisible, setPreviewBitmapVisible, setNumbersLayerVisible } = sessionActions
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
  // Invariant 1: the single authoritative display-size source. Seeded
  // from SSR, updated only by real user canvas commits, re-seeded from
  // the DB on a master transition (never collapses to null while a state
  // row exists). Keyed on the STABLE master identity (`masterRowId`), not
  // the active image id (which flips on every filter/crop/trace apply).
  // `displayTxU` is the one value the canvas-placement, trace dialog and
  // right-panel readout all read.
  const {
    displayTxU,
    handleImageTransformChange,
    handleNudge,
    getCurrentImageState,
    saveImageState,
  } = useDisplaySize({
    projectId,
    masterImageId: masterImage?.masterRowId ?? null,
    initial: initialImageState,
    canvasRef,
  })
  // The canvas-placement controller applies the persisted transform
  // before the first user edit; it reads the one source in ImageState
  // shape. Null = genuine fresh upload (no state) → intrinsic placement.
  const initialImageTransform = useMemo(() => getCurrentImageState(), [getCurrentImageState])
  const {
    sourceSnapshot,
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
    saveImageState,
  })
  const filterDialog = useFilterDialogSession(filterSourceImage)
  // Trace dialog needs the image's displayed size on the artboard in mm —
  // pixelate-grid math runs on display-mm, not source-px. The size comes
  // from the one authoritative source (`displayTxU`): no preference chain,
  // no silent intrinsic fallback. Null until workspace + source are both
  // ready (or a genuine fresh upload before the canvas places the image).
  const traceSourceImage = useMemo(() => {
    if (!filterSourceImage) return null
    const displayMm = displayTxToMm({ displayTxU, artboardWidthPx, artboardHeightPx })
    if (!displayMm) return null
    return { ...filterSourceImage, displayMmW: displayMm.displayMmW, displayMmH: displayMm.displayMmH }
  }, [filterSourceImage, artboardWidthPx, artboardHeightPx, displayTxU])
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
    // The trace-apply pre-save reads the one authoritative transform
    // (incl. persisted rotation) so the trace is computed against the
    // user's current display size, closing the resize→apply race.
    getCurrentImageTx: getCurrentImageState,
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
    // Mobile-only effect: user reached this action via the left-panel Sheet
    // (Trace has no desktop top-bar entry), so the Sheet is still open
    // behind the dialog. Closing it here means every exit (apply, X, escape,
    // cancel) lands in a clean editor. Desktop is a no-op — the aside is
    // `md:block` and ignores `leftPanelOpen`.
    setLeftPanelOpen(false)
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
      // delete_master_with_cascade is an atomic write: on success,
      // every image row (master + derivatives) is gone in the DB. The
      // resulting client state is trivial — null master, empty list.
      // We seed it directly and let the workflow machine pick up the
      // empty source via the existing SOURCE_SNAPSHOT useEffect, just
      // like the upload path does after PR #193.
      //
      // The authoritative display source (`useDisplaySize`) is keyed on
      // the stable `masterRowId`; `seedMasterImage(null)` flips that to
      // null, the hook's master-transition effect fires and clears
      // `displayTxU` to null (master delete = no working copy, no state).
      // No imperative cleanup needed.
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
    displayTxU,
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
  })

  // The trace's own frozen display rect (µpx, stage 2). The overlay
  // renders its SIZE/ASPECT from this rect — decoupled from the live
  // `imageTx` — so a 6×6 grid on a 200×100 resize stays square instead of
  // stretching to the master-intrinsic aspect (Invariant 2/3, stage 3).
  // "0" on all four is the legacy/lineart signal; the canvas then keeps
  // the prior behaviour (size from the live image rect).
  const traceDisplayRect = useMemo(
    () =>
      trace
        ? {
            display_x_px_u: trace.display_x_px_u,
            display_y_px_u: trace.display_y_px_u,
            display_width_px_u: trace.display_width_px_u,
            display_height_px_u: trace.display_height_px_u,
          }
        : null,
    [trace],
  )

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
                <>
                  <TraceSidebarSection
                    trace={trace ? { kind: trace.kind } : null}
                    isAddTraceDisabled={isAddTraceDisabled}
                    isClearingTrace={isClearingTrace}
                    isLoadingInitial={traceLoading}
                    onClearTrace={handleClearTrace}
                    onOpenSelection={openTraceSelection}
                  />
                  <TraceVisibilitySection
                    traceOverlayVisible={traceOverlayVisible}
                    previewBitmapVisible={previewBitmapVisible}
                    numbersLayerVisible={numbersLayerVisible}
                    onTraceOverlayChange={setTraceOverlayVisible}
                    onPreviewBitmapChange={setPreviewBitmapVisible}
                    onNumbersLayerChange={setNumbersLayerVisible}
                  />
                </>
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
              traceDisplayRect={traceDisplayRect}
              traceInteractive={leftPanelTab === "trace" && stageToolbar.tool === "direct"}
              traceOverlayVisible={traceOverlayVisible}
              previewBitmapVisible={previewBitmapVisible}
              numbersLayerVisible={numbersLayerVisible}
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

