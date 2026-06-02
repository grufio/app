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
import { deriveSectionLocks } from "@/lib/editor/section-locks"
import { MobileBottomNav, type MobileNavSection } from "@/features/editor/components/mobile-bottom-nav"
import { MobileColorsSheet } from "@/features/editor/components/mobile-colors-sheet"
import { deleteMasterImageWithCascade, removeProjectImageFilter } from "@/lib/api/project-images"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AppButton } from "@/components/ui/form-controls"
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
import { useEditorSessionState } from "@/lib/editor/hooks/use-editor-session-state"
import { usePageBackgroundState } from "@/lib/editor/hooks/use-page-background-state"
import { useProjectGrid } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useIsMobile } from "@/lib/ui/use-mobile"
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
import { ArtboardSurfaceScope } from "./editor-shell/artboard-surface-scope"
import { FilterSurfaceScope } from "./editor-shell/filter-surface-scope"
import { TraceSurfaceScope } from "./editor-shell/trace-surface-scope"
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
  // Single mobile-viewport check. Drives the canvas-view gates: on
  // `< md` there's no tab UI, so canvasMode + trace-overlay surface
  // their results based on data presence rather than `leftPanelTab`.
  const isMobile = useIsMobile()
  const [gridVisible, setGridVisible] = useState(true)
  const [selectedNavId, setSelectedNavId] = useState<string>(buildNavId({ kind: "artboard" }))
  // Mobile-only: the bottom-nav picks the active section, the canvas
  // surfaces section-specific layers (mirror desktop's `leftPanelTab`
  // gating — see `deriveDisplayLayers`), and each surface's scope
  // component owns its own floating Edit-icon + sheet.
  const [mobileSection, setMobileSection] = useState<"artboard" | "filter" | "trace" | "colors">("artboard")
  const handleMobileNavTap = useCallback((section: MobileNavSection) => {
    if (
      section === "artboard" ||
      section === "filter" ||
      section === "trace" ||
      section === "colors"
    ) {
      setMobileSection(section)
    }
    // "home" and "output" remain stubs (output not wired yet; home is
    // a `<Link>` not a callback).
  }, [])
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
  // All three surfaces own their own state inside per-surface scope
  // components mounted only while their surface is active — the
  // shell composes them with conditional rendering based on
  // `leftPanelTab` (desktop, via `ProjectEditorLeftPanel`'s
  // `filterPanelContent` / `tracePanelContent` slot) and
  // `mobileSection` (mobile). Lifecycle IS dismissal.

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

  // Workflow-level filter error toasts at shell scope. Dialog-level
  // filter errors (`filterDialog.error`) are toasted from inside
  // `FilterSurfaceScope` where the dialog state lives.
  const activeDisplayFilterId = filterStack[filterStack.length - 1]?.id ?? null
  const isActiveDisplayFilterHidden = activeDisplayFilterId ? Boolean(hiddenFilterIds[activeDisplayFilterId]) : false

  useDedupingErrorToast(workflowFilterPanelError)
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

  const isAddTraceDisabled = !hasFilterSourceImage || isNewFilterActionBusy || isApplyingTrace || isClearingTrace
  // Mobile-only effect: user reached the trace selection via the left-panel
  // Sheet (Trace has no desktop top-bar entry), so the Sheet is still open
  // behind the dialog. Closing it here means every exit (apply, X, escape,
  // cancel) lands in a clean editor. Desktop is a no-op.
  const closeLeftPanelOnTraceSelection = useCallback(() => {
    setLeftPanelOpen(false)
  }, [])

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
  // Filter + Trace configuring flags contributed by their respective
  // scope components' own useMutationLeaveGuard calls — browser ORs
  // the beforeunload listeners across instances.
  useMutationLeaveGuard({
    active: shouldWarnBeforeUnload({
      mutationInFlight:
        workflow.isApplyingFilter || workflow.isCropping || workflow.isRestoring,
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
  // Canvas-bound visibility flags are section-gated by
  // `deriveDisplayLayers` — outside the Trace section the effective
  // values collapse to `true`, so the Trace view toggles can't leak
  // into the Image / Filter tabs (PR #356 follow-up). The raw session
  // values below stay the source of truth for the checkbox UI.
  const {
    canvasImage,
    traceOverlaySvgUrl,
    showFilterChain,
    traceOverlayVisible: effectiveTraceOverlayVisible,
    previewBitmapVisible: effectivePreviewBitmapVisible,
    numbersLayerVisible: effectiveNumbersLayerVisible,
  } = useCanvasDerivedState({
    leftPanelTab,
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    mobileSection,
    isMobile,
    // The Image / Artboard section override needs the kind='master'
    // row's URL specifically, not the active image's URL. `signedUrl`
    // is the active row (filter tip after a filter is applied) — see
    // MasterImage type. Falsy empty string here turns the override
    // off in `pickCanvasImage` (graceful degrade — pre-PR-#354).
    masterSignedUrl: masterImage?.masterSignedUrl ? masterImage.masterSignedUrl : null,
    traceOverlayVisible,
    previewBitmapVisible,
    numbersLayerVisible,
  })
  // canvasMode is now a pure projection of `showFilterChain` — the
  // tab-vs-mobile-vs-image-ready logic lives in `deriveDisplayLayers`.
  // Kept as a string union because FilterSidebarSection + MobileFilterSheet
  // already destructure `canvasMode === "filter"`.
  const canvasMode: "image" | "filter" = showFilterChain ? "filter" : "image"

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

  // Section locks. The Image section is locked while *any* downstream
  // artefact (filter / trace) derives from the master; the Filter
  // section is locked while a trace derives from the filter chain. The
  // derivation is pure (see `lib/editor/section-locks.ts`); the actual
  // cascade-delete behind an unlock is wired below.
  const hasFilter = filterStack.length > 0
  const hasTrace = Boolean(trace)
  const sectionLocks = useMemo(
    () => deriveSectionLocks({ hasFilter, hasTrace }),
    [hasFilter, hasTrace],
  )
  const [unlockRequest, setUnlockRequest] = useState<
    | null
    | {
        scope: "image" | "filter"
        title: string
        message: string
      }
  >(null)
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const imageUnlockMessage = useMemo(() => {
    const parts: string[] = []
    if (hasFilter) {
      parts.push(`${filterStack.length} filter${filterStack.length === 1 ? "" : "s"}`)
    }
    if (hasTrace) parts.push("the trace overlay")
    return `Unlocking will permanently delete ${parts.join(" and ")}.`
  }, [hasFilter, hasTrace, filterStack.length])

  const filterUnlockMessage = "Unlocking will permanently delete the trace overlay."

  const imageLockBannerMessage = useMemo(() => {
    if (hasFilter && hasTrace) {
      return "Locked: filters and a trace depend on this image. Unlock removes them."
    }
    if (hasFilter) {
      return "Locked: a filter depends on this image. Unlock removes the filter."
    }
    if (hasTrace) {
      return "Locked: a trace depends on this image. Unlock removes the trace."
    }
    return ""
  }, [hasFilter, hasTrace])

  const filterLockBannerMessage = sectionLocks.filterToggleable
    ? "Locked: a trace depends on the filter chain. Unlock removes the trace."
    : "Locked: a trace exists. Remove it from the Trace section to edit filters."

  const requestImageUnlock = useCallback(() => {
    if (!sectionLocks.imageToggleable) return
    setUnlockError(null)
    setUnlockRequest({
      scope: "image",
      title: "Unlock image?",
      message: imageUnlockMessage,
    })
  }, [sectionLocks.imageToggleable, imageUnlockMessage])

  const requestFilterUnlock = useCallback(() => {
    if (!sectionLocks.filterToggleable) return
    setUnlockError(null)
    setUnlockRequest({
      scope: "filter",
      title: "Unlock filters?",
      message: filterUnlockMessage,
    })
  }, [sectionLocks.filterToggleable, filterUnlockMessage])

  const cancelUnlock = useCallback(() => {
    if (unlockBusy) return
    setUnlockRequest(null)
    setUnlockError(null)
  }, [unlockBusy])

  // Snapshot at confirm-time so a mid-flight refresh that mutates the
  // arrays underneath us doesn't change what we delete.
  const confirmUnlock = useCallback(async () => {
    if (!unlockRequest || unlockBusy) return
    setUnlockBusy(true)
    setUnlockError(null)
    const scope = unlockRequest.scope
    const traceToDrop = hasTrace
    const filterIdsTopDown = scope === "image" ? [...filterStack].map((f) => f.id).reverse() : []
    try {
      if (traceToDrop) {
        await handleClearTrace()
      }
      // Top-down filter removal — each call leaves `after = []` and
      // skips the chain rebuild that a from-the-middle remove would
      // trigger.
      for (const filterId of filterIdsTopDown) {
        await removeProjectImageFilter({ projectId, filterId })
      }
      // Trace was already refreshed by handleClearTrace; filters were
      // not — pull a fresh empty chain so derivations (lock state,
      // filterStack, working image) settle in one render.
      if (filterIdsTopDown.length > 0) {
        await Promise.allSettled([refreshFilterImage(), refreshProjectImages()])
      }
      setUnlockRequest(null)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed")
    } finally {
      setUnlockBusy(false)
    }
  }, [
    unlockRequest,
    unlockBusy,
    hasTrace,
    filterStack,
    handleClearTrace,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
  ])

  const imageLock = sectionLocks.imageLocked
    ? {
        message: imageLockBannerMessage,
        toggleable: sectionLocks.imageToggleable,
        busy: unlockBusy && unlockRequest?.scope === "image",
        onUnlock: requestImageUnlock,
      }
    : null

  const filterLock = sectionLocks.filterLocked
    ? {
        message: filterLockBannerMessage,
        toggleable: sectionLocks.filterToggleable,
        busy: unlockBusy && unlockRequest?.scope === "filter",
        onUnlock: requestFilterUnlock,
      }
    : null

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
              imageLocked={sectionLocks.imageLocked}
              imageLockToggleable={sectionLocks.imageToggleable}
              onImageUploaded={handleImageUploaded}
              onImageDeleteRequested={requestDeleteImage}
              onImageUnlockRequested={requestImageUnlock}
              onGridCreateRequested={requestCreateGrid}
              onGridDeleteRequested={requestDeleteGrid}
              filterPanelContent={
                !isMobile ? (
                  <FilterSurfaceScope
                    intent="desktop"
                    filterSourceImage={filterSourceImage}
                    onApplyFilter={handleApplyFilter}
                    isAddFilterDisabled={isAddFilterDisabled}
                    workflowDismissError={workflow.dismissError}
                    filterStack={filterStack}
                    canvasMode={canvasMode}
                    hiddenFilterIds={hiddenFilterIds}
                    activeDisplayFilterId={activeDisplayFilterId}
                    isActiveDisplayFilterHidden={isActiveDisplayFilterHidden}
                    isRemovingFilter={workflow.isRemovingFilter}
                    isLoadingInitial={filterImageLoading && !filterImageLoadedOnce}
                    lock={filterLock}
                    onSelectFilter={showFilter}
                    onToggleHidden={handleToggleHidden}
                    onRemoveFilter={workflow.removeFilter}
                  />
                ) : null
              }
              tracePanelContent={
                !isMobile ? (
                  <TraceSurfaceScope
                    intent="desktop"
                    traceSourceImage={traceSourceImage}
                    onApplyTrace={handleApplyTrace}
                    isAddTraceDisabled={isAddTraceDisabled}
                    isClearingTrace={isClearingTrace}
                    isLoadingInitial={traceLoading}
                    trace={trace ? { kind: trace.kind } : null}
                    onClearTrace={handleClearTrace}
                    onBeforeOpenSelection={closeLeftPanelOnTraceSelection}
                    traceOverlayVisible={traceOverlayVisible}
                    previewBitmapVisible={previewBitmapVisible}
                    numbersLayerVisible={numbersLayerVisible}
                    onTraceOverlayChange={setTraceOverlayVisible}
                    onPreviewBitmapChange={setPreviewBitmapVisible}
                    onNumbersLayerChange={setNumbersLayerVisible}
                  />
                ) : null
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
              traceOverlayVisible={effectiveTraceOverlayVisible}
              previewBitmapVisible={effectivePreviewBitmapVisible}
              numbersLayerVisible={effectiveNumbersLayerVisible}
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
            onGridDeleteRequested={requestDeleteGrid}
            canvasRef={canvasRef}
            traceTabActive={leftPanelTab === "trace"}
            traceOverlayVisible={traceOverlayVisible}
            previewBitmapVisible={previewBitmapVisible}
            numbersLayerVisible={numbersLayerVisible}
            onTraceOverlayVisibleChange={setTraceOverlayVisible}
            onPreviewBitmapVisibleChange={setPreviewBitmapVisible}
            onNumbersLayerVisibleChange={setNumbersLayerVisible}
            imageLock={imageLock}
            open={rightPanelOpen}
            onOpenChange={setRightPanelOpen}
          />
          {/* Filter + Trace dialog hosts moved into their respective
              surface scope components (see panel slots + mobile gates). */}
        </EditorErrorBoundary>
        {isMobile && mobileSection === "artboard" ? (
          <ArtboardSurfaceScope
            projectId={projectId}
            pageBgEnabled={pageBgEnabled}
            pageBgColor={pageBgColor}
            pageBgOpacity={pageBgOpacity}
            onPageBgEnabledChange={handlePageBgEnabledChange}
            onPageBgColorChange={handlePageBgColorChange}
            onPageBgOpacityChange={handlePageBgOpacityChange}
            canFit={Boolean(masterImage) && !masterImageLoading && !deleteBusy}
            onFitToArtboard={() => canvasRef.current?.fitImageToArtboard()}
            hasGrid={hasGrid}
            gridVisible={gridVisible}
            onGridVisibleChange={setGridVisible}
            onGridCreateRequested={async () => {
              await createGrid()
            }}
            onGridDeleteRequested={requestDeleteGrid}
            hasMasterImage={Boolean(masterImage)}
            onImageUploaded={handleImageUploaded}
            panelImageTxU={panelImageTxU}
            workspaceUnit={workspaceUnit ?? "cm"}
            imagePanelReady={imagePanelReady}
            imagePanelEnabled={Boolean(masterImage) && workspaceReady && !sectionLocks.imageLocked}
            imageLock={imageLock}
            masterImageLoading={masterImageLoading}
            deleteBusy={deleteBusy}
            restoreBusy={workflow.isRestoring}
            canvasRef={canvasRef}
            onRequestRestore={() => setRestoreOpen(true)}
            onRequestDelete={requestDeleteSelectedImage}
          />
        ) : null}
        {isMobile && mobileSection === "filter" ? (
          <FilterSurfaceScope
            intent="mobile"
            filterSourceImage={filterSourceImage}
            onApplyFilter={handleApplyFilter}
            isAddFilterDisabled={isAddFilterDisabled}
            workflowDismissError={workflow.dismissError}
            filterStack={filterStack}
            canvasMode={canvasMode}
            hiddenFilterIds={hiddenFilterIds}
            activeDisplayFilterId={activeDisplayFilterId}
            isActiveDisplayFilterHidden={isActiveDisplayFilterHidden}
            isRemovingFilter={workflow.isRemovingFilter}
            isLoadingInitial={filterImageLoading && !filterImageLoadedOnce}
            lock={filterLock}
            onSelectFilter={showFilter}
            onToggleHidden={handleToggleHidden}
            onRemoveFilter={workflow.removeFilter}
          />
        ) : null}
        {isMobile && mobileSection === "trace" ? (
          <TraceSurfaceScope
            intent="mobile"
            traceSourceImage={traceSourceImage}
            onApplyTrace={handleApplyTrace}
            isAddTraceDisabled={isAddTraceDisabled}
            isClearingTrace={isClearingTrace}
            isLoadingInitial={traceLoading}
            trace={trace ? { kind: trace.kind } : null}
            onClearTrace={handleClearTrace}
            traceOverlayVisible={traceOverlayVisible}
            previewBitmapVisible={previewBitmapVisible}
            numbersLayerVisible={numbersLayerVisible}
            onTraceOverlayChange={setTraceOverlayVisible}
            onPreviewBitmapChange={setPreviewBitmapVisible}
            onNumbersLayerChange={setNumbersLayerVisible}
          />
        ) : null}
        {isMobile && mobileSection === "colors" ? (
          <MobileColorsSheet
            paletteIndicesUsed={trace?.palette_indices_used ?? null}
            traceMode={(() => {
              // All three trace kinds (pixelate, circulate, lineart)
              // carry color_mode in params and snap on Munsell. Default
              // "color" when missing (pre-snap legacy rows would never
              // reach this branch — they have palette_indices_used=null
              // and short-circuit to the "re-run" empty state).
              if (!trace) return null
              const cm = (trace.params as { color_mode?: unknown }).color_mode
              return cm === "bw" ? "bw" : "color"
            })()}
            hasTrace={trace != null}
          />
        ) : null}
      </ProjectEditorLayout>
      <MobileBottomNav
        activeSection={mobileSection}
        onSectionTap={handleMobileNavTap}
        imageLocked={sectionLocks.imageLocked}
        filterLocked={sectionLocks.filterLocked}
      />

      <Dialog open={unlockRequest !== null} onOpenChange={(o) => (!o ? cancelUnlock() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{unlockRequest?.title ?? "Unlock?"}</DialogTitle>
            <DialogDescription>{unlockRequest?.message ?? ""}</DialogDescription>
          </DialogHeader>
          {unlockError ? <div role="alert" className="text-sm text-destructive">{unlockError}</div> : null}
          <DialogFooter>
            <AppButton type="button" variant="outline" onClick={cancelUnlock} disabled={unlockBusy}>
              Cancel
            </AppButton>
            <AppButton type="button" variant="destructive" onClick={confirmUnlock} disabled={unlockBusy}>
              {unlockBusy ? "Unlocking…" : "Unlock"}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

