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
  EditorImageDialogs,
  ProjectEditorHeader,
  ProjectEditorLayout,
  ProjectEditorStage,
  type ProjectCanvasStageHandle,
} from "@/features/editor"
import { deriveSectionLocks } from "@/lib/editor/section-locks"
import {
  buildResetMessage,
  buildResetTitle,
  buildDeleteTitle,
  buildDeleteLeafMessage,
  type ResetScope,
  type DeleteScope,
} from "@/features/editor/components/delete-message"
import { EditorHomeBar } from "@/features/editor/components/editor-home-bar"
import { EditorViewBar } from "@/features/editor/components/editor-view-bar"
import { EditorSectionStepper } from "@/features/editor/components/editor-section-stepper"
import { EditorImageBar } from "@/features/editor/components/editor-image-bar"
import { EditorFilterBar } from "@/features/editor/components/editor-filter-bar"
import { EditorTraceBar } from "@/features/editor/components/editor-trace-bar"
import { ColorsDialog } from "@/features/editor/components/colors-dialog"
import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { EditorToolbarToneProvider } from "@/features/editor/components/editor-toolbar-tone"
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
import { previewProjectTrace } from "@/lib/api/project-trace"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { useDisplaySize } from "@/lib/editor/hooks/use-display-size"
import { useMasterImageUploader } from "@/lib/editor/hooks/use-master-image-uploader"
import { useDedupingErrorToast } from "@/lib/editor/hooks/use-deduping-error-toast"
import { useTraceHandlers } from "./editor-shell/use-trace-handlers"
import { useCanvasDerivedState } from "./editor-shell/use-canvas-derived-state"
import { useEditorKeyboard } from "@/lib/editor/hooks/use-editor-keyboard"
import { useMutationLeaveGuard } from "@/lib/editor/hooks/use-mutation-leave-guard"
import { shouldWarnBeforeUnload } from "@/lib/editor/hooks/should-warn-before-unload"
import { useEditorSessionState } from "@/lib/editor/hooks/use-editor-session-state"
import { usePageBackgroundState } from "@/lib/editor/hooks/use-page-background-state"
import { useProjectGrid } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { reportError } from "@/lib/monitoring/error-reporting"
import type { ImageState } from "@/lib/editor/imageState"
import type { MasterImage } from "@/lib/editor/master-image"
import type { Project } from "@/lib/editor/hooks/use-project"
import { useProject } from "@/lib/editor/hooks/use-project"
import { computeRenderableGrid } from "@/services/editor/grid/validation"
import { normalizeWorkspacePadding } from "@/services/editor/padding"
import { pxUToPxNumber } from "@/lib/editor/units"
import { computeContentRegionPlan, type TraceContentRegion } from "@/lib/editor/trace/content-region"
import { TraceCoverageDialog } from "@/features/editor/components/trace-coverage-dialog"
import { useRightPanelModel } from "./editor-shell/use-right-panel-model"
import { useStageInteractionPolicy } from "./editor-shell/use-stage-interaction-policy"
import { useEditorWorkflowAdapter } from "./editor-shell/use-editor-workflow-adapter"
import { ArtboardSurfaceScope } from "./editor-shell/artboard-surface-scope"
import { ColorsSurfaceScope } from "./editor-shell/colors-surface-scope"
import { TraceSurfaceScope } from "./editor-shell/trace-surface-scope"
import { usePanelUIState } from "./editor-shell/use-panel-ui-state"
import { useImageActionRequests } from "./editor-shell/use-image-action-requests"
import { deriveImageBarMode } from "./editor-shell/image-bar-mode"

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
  // The master read-model is owned by the workflow machine (read-model phase B).
  // `masterImage` / `masterImageLoading` are aliased from `workflow.*` below.
  // `deleteError` is the delete-dialog surface (was in the old master hook).
  const [deleteError, setDeleteError] = useState("")
  // useDisplaySize needs the stable masterRowId, but the master now comes from
  // the machine (created after this line). Mirror it into state and update it
  // from `workflow.masterRowId` after the adapter — a one-render lag on a real
  // master change, which the reseed effect tolerates.
  const [displayMasterRowId, setDisplayMasterRowId] = useState<string | null>(
    initialMasterImage?.masterRowId ?? null,
  )

  const {
    state: sessionState,
    actions: sessionActions,
  } = useEditorSessionState()
  const { restoreOpen, deleteOpen, toolbarTheme, traceOverlayVisible, previewBitmapVisible, numbersLayerVisible } = sessionState
  const { setRestoreOpen, setDeleteOpen, toggleToolbarTheme, setTraceOverlayVisible, setPreviewBitmapVisible, setNumbersLayerVisible } = sessionActions
  // The editor is now canvas-first on both viewports: the floating
  // bottom nav picks the active section (`editorSection`), the
  // canvas surfaces section-specific layers (see `deriveDisplayLayers`),
  // and each surface's scope component owns its own floating Edit-icon
  // + sheet (a bounded card on `md+`, fullscreen on mobile).
  const {
    gridVisible,
    setGridVisible,
    selectedNavId,
    setSelectedNavId,
    editorSection,
    setEditorSection,
    handleSectionTap,
    pendingTraceKindOpen,
    setPendingTraceKindOpen,
    consumePendingTraceKindOpen,
    pendingTraceSelectionOpen,
    setPendingTraceSelectionOpen,
    consumePendingTraceSelectionOpen,
    pendingArtboardDialog,
    setPendingArtboardDialog,
    consumePendingArtboardDialog,
  } = usePanelUIState()
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
    masterImageId: displayMasterRowId,
    initial: initialImageState,
    canvasRef,
  })
  // The canvas-placement controller applies the persisted transform
  // before the first user edit; it reads the one source in ImageState
  // shape. Null = genuine fresh upload (no state) → intrinsic placement.
  const initialImageTransform = useMemo(() => getCurrentImageState(), [getCurrentImageState])
  // Trace handlers are created BEFORE the workflow adapter so `refreshTrace`
  // can join the adapter's "refresh all editor data" — the trace is downstream
  // of the filter (removing a filter cascades it server-side), so every
  // workflow mutation must re-fetch the trace or `hasTrace` goes stale.
  const {
    trace,
    traceLoading,
    refreshTrace,
  } = useTraceHandlers({ projectId })
  const {
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    loadProjectImages,
    uploadSyncError,
    restoreOperationError,
    workflowFilterPanelError,
  } = useEditorWorkflowAdapter({
    projectId,
    initialMaster: initialMasterImage,
    refreshTrace,
    saveImageState,
    // Trace apply/clear run through the machine; the apply service pre-saves
    // this transform to close the resize→apply race.
    getCurrentImageTx: getCurrentImageState,
  })
  // Master + filter read-models are machine-owned (phases B/C); alias so the
  // many downstream reads stay unchanged, and mirror the stable masterRowId
  // into the display key.
  const masterImage = workflow.master
  const masterImageLoading = workflow.masterLoading
  const filterDisplayImage = workflow.filter.image
  const filterDisplayImageWithoutTrace = workflow.filter.imageWithoutTrace
  const filterStack = workflow.filter.stack
  const filterImageLoading = workflow.filter.loading
  useEffect(() => {
    // Mirror the machine-owned masterRowId back to the display-size key. Safe:
    // the dep is a primitive that only changes on a real master upload/replace/
    // delete (masterRowId is signature-stable across filter/crop/trace), so this
    // fires at most once per master change — not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayMasterRowId(workflow.masterRowId)
  }, [workflow.masterRowId])

  // Master-image uploader mounted once at the shell. Lets the "Add image"
  // affordances (menu bar + image bar) open the OS / mobile file picker
  // DIRECTLY on tap — no intermediate sheet. Only used when there is no
  // master image yet; when one exists the same icon opens the edit dialog.
  const imageUploader = useMasterImageUploader({ projectId, onUploaded: handleImageUploaded })
  const hasMasterImage = Boolean(masterImage)
  // Tri-state for the Image bar, keyed on the SAME source read-model status the
  // canvas + Filter bar use: "edit" (image present) / "pending" (still loading —
  // show nothing, so no "Add" flash) / "add" (confirmed empty). See
  // `image-bar-mode.ts`.
  const imageBarMode = deriveImageBarMode({
    sourceStatus: editorImageSource.status,
    hasMaster: hasMasterImage,
  })
  const hasEditableImage = imageBarMode === "edit"

  // Each surface owns its own state inside a per-surface scope
  // component mounted only while that surface is active — the shell
  // composes them with conditional rendering on `editorSection`
  // (the single section input for both viewports). Lifecycle IS
  // dismissal.

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

  // Workflow-level filter error toasts at shell scope.
  useDedupingErrorToast(workflowFilterPanelError)
  useDedupingErrorToast(uploadSyncError)

  useEffect(() => {
    const unresolvedSourceMessage = "Working image target is unresolved. Refresh editor state."
    if (editorImageSource.status !== "error" || editorImageSource.error !== unresolvedSourceMessage) {
      lastNoWorkingImageMetricRef.current = ""
      return
    }
    const metricKey = `${projectId}:${editorImageSource.error}`
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
        sourceStatus: editorImageSource.status,
      },
    })
  }, [projectId, editorImageSource])

  // Pipeline: Master → Filter → Trace. Section locks derive purely from
  // data-presence (see `lib/editor/section-locks.ts`): a filter is UPSTREAM of
  // the trace, so `filterLocked = hasTrace`. Derived here (not lower down) so
  // the add-filter gate can honour it.
  const hasFilter = filterStack.length > 0
  const hasTrace = Boolean(trace)
  const sectionLocks = useMemo(
    () => deriveSectionLocks({ hasFilter, hasTrace }),
    [hasFilter, hasTrace],
  )

  const hasFilterSourceImage = Boolean(filterSourceImage)
  const isNewFilterActionBusy = filterImageLoading || workflow.isMutating || workflow.isSyncing
  // Adding a filter must be blocked while a trace exists — a filter under an
  // existing trace would reorder the pipeline and invalidate the trace. This is
  // exactly `filterLocked`, and it also covers the trace-on-master case (no
  // filter) where the Filter bar still shows "Add filter".
  const isAddFilterDisabled = !hasFilterSourceImage || isNewFilterActionBusy || sectionLocks.filterLocked

  // Trace apply/clear now run through the workflow machine, so their busy state
  // is already part of `isNewFilterActionBusy` (workflow.isMutating).
  const isAddTraceDisabled = !hasFilterSourceImage || isNewFilterActionBusy

  const {
    requestDeleteSelectedImage,
    requestDeleteGrid,
  } = useImageActionRequests({
    setSelectedNavId,
    projectImages: workflow.projectImages,
    masterImageId: masterImage?.id ?? null,
    setDeleteError,
    setDeleteOpen,
    deleteGrid,
  })

  const { toolbar, stageToolbar, applyCropSelection } = useStageInteractionPolicy({
    canvasRef,
    activeSection: editorSection,
    sourceReady: editorImageSource.status === "ready",
    selectedNavId,
    setSelectedNavId,
    activeCanvasImageId,
    isCropping: workflow.isCropping,
    onApplyCrop: workflow.applyCrop,
    // Lock all image manipulation while a filter/trace depends on the image.
    imageLocked: filterStack.length > 0 || Boolean(trace),
  })

  // Delete runs through the machine (`deletingMaster → syncing → idle`): the
  // service does the cascade delete + seeds the empty state; the machine's
  // refresh reconciles. Busy/error come from the machine (isDeletingMaster /
  // operationError), not a loose flag.
  const handleDeleteMasterImage = useCallback(async () => {
    try {
      await workflow.deleteMaster()
      setDeleteOpen(false)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete image")
    }
  }, [workflow, setDeleteOpen, setDeleteError])

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
    canDelete: hasEditableImage,
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

  // Padding form is self-contained (reads the workspace row + saves directly,
  // like ArtboardPanel/GridPanel) — no shell hook. The canvas still reads the
  // saved padding via `paddingPx` below.

  const { panelImageTxU, workspaceReady, imagePanelReady } = useRightPanelModel({
    displayTxU,
    workspaceLoading,
    workspaceUnit,
    masterImage,
  })

  useEffect(() => {
    // The master-images list only changes when the master itself does (upload /
    // replace / delete → masterImage.id flips), so reload it here (and on mount).
    // Filter/trace/crop don't touch the list, so it's NOT part of the machine's
    // per-mutation refreshAll. `loadProjectImages` feeds the machine context.
    void loadProjectImages()
  }, [masterImage?.id, loadProjectImages])

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
    traceOverlayVisible: effectiveTraceOverlayVisible,
    previewBitmapVisible: effectivePreviewBitmapVisible,
    numbersLayerVisible: effectiveNumbersLayerVisible,
  } = useCanvasDerivedState({
    editorImageSource,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    editorSection,
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
  // Floating-bar tone is a manual session setting (default "dark"/black),
  // flipped by the top-right theme toggle. No image-brightness detection.
  const toolbarTone = toolbarTheme

  // The trace's own frozen display rect (µpx, stage 2). The overlay
  // renders its SIZE/ASPECT from this rect — decoupled from the live
  // `imageTx` — so a 6×6 grid on a 200×100 resize stays square instead of
  // stretching to the master-intrinsic aspect (Invariant 2/3, stage 3).
  // "0" on all four is the legacy/linerate signal; the canvas then keeps
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

  // Print-margin padding in artboard px, for the grey preview strips on canvas.
  const paddingPx = useMemo(() => {
    const p = normalizeWorkspacePadding(workspaceRow)
    return {
      top: pxUToPxNumber(BigInt(p.topPxU)),
      bottom: pxUToPxNumber(BigInt(p.bottomPxU)),
      left: pxUToPxNumber(BigInt(p.leftPxU)),
      right: pxUToPxNumber(BigInt(p.rightPxU)),
    }
  }, [workspaceRow])

  // Content-region plan for the trace configure PREVIEW (parity with the apply
  // crop): the preview shows the SAME content-rect window (white where the image
  // doesn't cover), on the content-rect mm. Same inputs as the apply-time
  // coverage check below; mm from artboard px (GEOMETRY_PPI = 72).
  const traceContentRegion = useMemo<TraceContentRegion | null>(() => {
    if (!displayTxU || !masterImage || !artboardWidthPx || !artboardHeightPx) return null
    const plan = computeContentRegionPlan({
      artboardWPx: artboardWidthPx,
      artboardHPx: artboardHeightPx,
      padding: { topPx: paddingPx.top, bottomPx: paddingPx.bottom, leftPx: paddingPx.left, rightPx: paddingPx.right },
      image: {
        leftPx: pxUToPxNumber(displayTxU.x) - pxUToPxNumber(displayTxU.w) / 2,
        topPx: pxUToPxNumber(displayTxU.y) - pxUToPxNumber(displayTxU.h) / 2,
        widthPx: pxUToPxNumber(displayTxU.w),
        heightPx: pxUToPxNumber(displayTxU.h),
      },
      intrinsicWPx: masterImage.width_px,
      intrinsicHPx: masterImage.height_px,
    })
    if (!plan.ok) return null
    return {
      plan,
      displayMmW: (plan.contentRectPx.widthPx / 72) * 25.4,
      displayMmH: (plan.contentRectPx.heightPx / 72) * 25.4,
    }
  }, [displayTxU, masterImage, artboardWidthPx, artboardHeightPx, paddingPx])

  // Trace dialog source + its content region (drives the configure preview).
  const traceDialogSourceImage = useMemo(
    () => (traceSourceImage ? { ...traceSourceImage, contentRegion: traceContentRegion } : null),
    [traceSourceImage, traceContentRegion],
  )

  // Coverage warning before a trace apply: the trace only converts the content
  // rect (artboard − padding); if the image doesn't fully cover it, the missing
  // area is rendered white — warn first (Attention / Cancel / Proceed).
  const [coverageWarnOpen, setCoverageWarnOpen] = useState(false)
  const coverageResolveRef = useRef<((v: boolean) => void) | null>(null)
  const settleCoverage = useCallback((proceed: boolean) => {
    setCoverageWarnOpen(false)
    const resolve = coverageResolveRef.current
    coverageResolveRef.current = null
    resolve?.(proceed)
  }, [])
  const handleApplyTraceGuarded = useCallback(
    async (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => {
      if (displayTxU && masterImage?.width_px && masterImage?.height_px && artboardWidthPx && artboardHeightPx) {
        const region = computeContentRegionPlan({
          artboardWPx: artboardWidthPx,
          artboardHPx: artboardHeightPx,
          padding: { topPx: paddingPx.top, bottomPx: paddingPx.bottom, leftPx: paddingPx.left, rightPx: paddingPx.right },
          image: {
            leftPx: pxUToPxNumber(displayTxU.x) - pxUToPxNumber(displayTxU.w) / 2,
            topPx: pxUToPxNumber(displayTxU.y) - pxUToPxNumber(displayTxU.h) / 2,
            widthPx: pxUToPxNumber(displayTxU.w),
            heightPx: pxUToPxNumber(displayTxU.h),
          },
          intrinsicWPx: masterImage.width_px,
          intrinsicHPx: masterImage.height_px,
        })
        if (region.ok && region.coverage !== "full") {
          const proceed = await new Promise<boolean>((resolve) => {
            coverageResolveRef.current = resolve
            setCoverageWarnOpen(true)
          })
          if (!proceed) return
        }
      }
      await workflow.applyTrace(args)
    },
    [displayTxU, masterImage, artboardWidthPx, artboardHeightPx, paddingPx, workflow],
  )

  // Linerate dialog preview: run the SAME server trace at 0.5 MP and return the
  // un-persisted SVG string. Read-only — no workflow mutation, no coverage
  // guard (the preview just visualises what Apply would produce).
  const handlePreviewTrace = useCallback(
    async (args: { kind: RegisteredTraceId; params: Record<string, unknown> }): Promise<string> => {
      const { svg } = await previewProjectTrace({ projectId, kind: args.kind, params: args.params })
      return svg
    },
    [projectId],
  )

  const handleTitleUpdated = useCallback((nextTitle: string) => setProject({ id: projectId, name: nextTitle }), [projectId, setProject])

  // Closing the configure dialog returns to the trace section so the
  // user lands back on the current trace state, not the Image/artboard
  // tab. The dialog itself unmounts via closeConfigure, so no stale draft
  // preview lingers.
  const handleTraceConfigureCancelled = useCallback(() => {
    setEditorSection("trace")
  }, [setEditorSection])
  // Filter picker (top-right "+" / edit) open state — the Filter section's
  // sole dialog. Local, mounted only while the Filter section is active.
  const [filterSelectionOpen, setFilterSelectionOpen] = useState(false)
  // Colors dialog (Trace section) — opened by the bold colour-count button in
  // the trace bar. The realized colour count is the length of the trace's used
  // palette indices (`null`/`0` for linerate/legacy → no button).
  const [colorsOpen, setColorsOpen] = useState(false)
  const traceColorCount = trace?.palette_indices_used?.length ?? null

  // Reset (bar RotateCcw) = remove the downstream artefact that locks a layer,
  // keeping the layer itself. Image scope → remove the filter (cascades the trace
  // server-side) or, if a trace sits directly on the master, clear it. Filter
  // scope → clear the trace. Confirmed via the reset dialog below.
  const [resetScope, setResetScope] = useState<ResetScope | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const confirmReset = useCallback(async () => {
    if (!resetScope || resetBusy) return
    setResetBusy(true)
    setResetError(null)
    try {
      if (resetScope === "image" && hasFilter) {
        // Single-artefact model: at most one filter per project.
        const filterId = filterStack[0]?.id
        if (filterId) await workflow.removeFilter(filterId) // cascades the trace
      } else {
        await workflow.clearTrace()
      }
      setResetScope(null)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setResetBusy(false)
    }
  }, [resetScope, resetBusy, hasFilter, filterStack, workflow])

  // Leaf-delete (bar Trash) = remove the section's OWN artefact (the filter or
  // the trace itself), always behind this confirm. Only reachable while nothing
  // downstream locks the layer (locked → the bar shows Reset, not Delete). The
  // `finally` closes any open section surface (filter picker) AND clears the
  // busy flag whether the mutation resolved or rejected, so a failed clear
  // never strands an open surface — the same discipline as `confirmReset`.
  const [deleteScope, setDeleteScope] = useState<DeleteScope | null>(null)
  const [deleteBusy2, setDeleteBusy2] = useState(false)
  const [deleteScopeError, setDeleteScopeError] = useState<string | null>(null)

  const confirmDeleteScope = useCallback(async () => {
    if (!deleteScope || deleteBusy2) return
    setDeleteBusy2(true)
    setDeleteScopeError(null)
    try {
      if (deleteScope === "filter") {
        const filterId = filterStack[0]?.id
        if (filterId) await workflow.removeFilter(filterId)
      } else {
        await workflow.clearTrace()
      }
      setDeleteScope(null)
    } catch (err) {
      setDeleteScopeError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      // Always close the section's open surface, resolved or rejected.
      setFilterSelectionOpen(false)
      setDeleteBusy2(false)
    }
  }, [deleteScope, deleteBusy2, filterStack, workflow])


  return (
    // Fixed viewport height (not min-h): the editor is a full-screen app, so
    // the root must never grow past the viewport. With `min-h-svh` some
    // descendant could inflate the height at runtime, which pushed the bottom
    // nav (anchored to the editor box) down without letting it come back up on
    // shrink. `h-svh` + `overflow-hidden` clamps the box to the viewport in
    // both directions so the nav always tracks the bottom edge.
    <div className="flex h-svh w-full flex-col overflow-hidden">
      <ProjectEditorHeader
        projectId={projectId}
        initialTitle={project && project.id === projectId ? project.name : "Untitled"}
        onTitleUpdated={handleTitleUpdated}
      />

      <ProjectEditorLayout>
        <EditorToolbarToneProvider tone={toolbarTone}>
        <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
          <main className="flex min-w-0 flex-1">
            <ProjectEditorStage
              projectId={projectId}
              masterImage={canvasImage}
              masterImageLoading={editorImageSource.status === "loading"}
              masterImageError={editorImageSource.status === "error" ? editorImageSource.error : ""}
              toolbar={stageToolbar}
              // The canvas-editing tools (zoom / hand / crop) belong to the
              // Image section only. Every other section hides them.
              showToolsBar={editorSection === "image"}
              // The Trace section gets a reduced floating bar: Hand · Arrow
              // (placeholder) · Zoom out · Zoom in.
              showTraceToolsBar={editorSection === "trace"}
              canvasRef={canvasRef}
              artboardWidthPx={artboardWidthPx ?? undefined}
              artboardHeightPx={artboardHeightPx ?? undefined}
              grid={grid}
              paddingPx={paddingPx}
              traceOverlaySvgUrl={traceOverlaySvgUrl}
              traceDisplayRect={traceDisplayRect}
              traceInteractive={editorSection === "trace" && stageToolbar.tool === "direct"}
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

          {/* Restore + Delete image dialogs — viewport-agnostic,
              mounted once. Driven by shell state from both the
              artboard surface scope (Edit sheet) and the keyboard
              delete path. */}
          <EditorImageDialogs
            restoreOpen={restoreOpen}
            setRestoreOpen={setRestoreOpen}
            restoreBusy={workflow.isRestoring}
            restoreError={restoreOperationError}
            onRestoreImage={handleRestoreInitialImage}
            deleteOpen={deleteOpen}
            setDeleteOpen={setDeleteOpen}
            deleteBusy={workflow.isDeletingMaster}
            deleteError={deleteError}
            handleDeleteMasterImage={handleDeleteMasterImage}
            cascadeFilterCount={filterStack.length}
            cascadeHasTrace={Boolean(trace)}
          />
          <TraceCoverageDialog
            open={coverageWarnOpen}
            onCancel={() => settleCoverage(false)}
            onProceed={() => settleCoverage(true)}
          />
          {/* Filter + Trace dialog hosts live inside their respective
              surface scope components (see the section mounts below). */}
        </EditorErrorBoundary>
        {/* Image-section top-right submenu: Add (no image) or Delete + Edit
            (image set). This top-right bar is the SOLE opener of the image
            dialog / picker — tapping the Image section only navigates, so the
            navigation-preservation for the no-master case holds by construction.
            The pencil opens the merged Image + Artboard dialog. */}
        {/* While the source state is still `loading` (mode "pending") the bar is
            not rendered at all — this is what stops the ~500ms "Add image" flash
            before the real Edit/Delete controls appear. */}
        {editorSection === "image" && imageBarMode !== "pending" ? (
          <EditorImageBar
            hasImage={hasEditableImage}
            onOpen={() =>
              hasEditableImage ? setPendingArtboardDialog("image") : imageUploader.openFilePicker()
            }
            onDelete={requestDeleteSelectedImage}
            locked={sectionLocks.imageLocked}
            onReset={() => setResetScope("image")}
          />
        ) : null}
        {/* Merged Image + Artboard dialog host (ImageSheet) lives in
            ArtboardSurfaceScope, mounted on the image section. The pencil in
            the top bar sets `pendingArtboardDialog = "image"`, which the scope
            consumes to open the sheet. */}
        {editorSection === "image" ? (
          <ArtboardSurfaceScope
            pendingDialog={pendingArtboardDialog}
            onConsumePendingDialog={consumePendingArtboardDialog}
            projectId={projectId}
            pageBgEnabled={pageBgEnabled}
            pageBgColor={pageBgColor}
            pageBgOpacity={pageBgOpacity}
            onPageBgEnabledChange={handlePageBgEnabledChange}
            onPageBgColorChange={handlePageBgColorChange}
            onPageBgOpacityChange={handlePageBgOpacityChange}
            canFit={Boolean(masterImage) && !masterImageLoading && !workflow.isDeletingMaster}
            onFitToArtboard={() => canvasRef.current?.fitImageToArtboard()}
            hasGrid={hasGrid}
            gridVisible={gridVisible}
            onGridVisibleChange={setGridVisible}
            onGridCreateRequested={async () => {
              await createGrid()
            }}
            onGridDeleteRequested={requestDeleteGrid}
            hasMasterImage={hasEditableImage}
            onImageUploaded={handleImageUploaded}
            panelImageTxU={panelImageTxU}
            workspaceUnit={workspaceUnit ?? "cm"}
            imagePanelReady={imagePanelReady}
            imagePanelEnabled={Boolean(masterImage) && workspaceReady}
            masterImageLoading={masterImageLoading}
            deleteBusy={workflow.isDeletingMaster}
            restoreBusy={workflow.isRestoring}
            canvasRef={canvasRef}
            onRequestRestore={() => setRestoreOpen(true)}
          />
        ) : null}
        {/* Filter-section top-right submenu: Plus (no filter) opens the
            picker; Trash2 + Pencil (filter set) delete / re-open the picker.
            The picker itself mounts here too, gated on the section. */}
        {editorSection === "filter" ? (
          <EditorFilterBar
            hasFilter={hasFilter}
            addDisabled={isAddFilterDisabled}
            onOpen={() => setFilterSelectionOpen(true)}
            onDelete={() => setDeleteScope("filter")}
            deleteDisabled={!workflow.canMutate}
            locked={sectionLocks.filterLocked}
            onReset={() => setResetScope("filter")}
          />
        ) : null}
        {editorSection === "filter" ? (
          <FilterSelectionController
            open={filterSelectionOpen}
            onClose={() => setFilterSelectionOpen(false)}
            onApply={(filterType) => handleApplyFilter({ filterType, filterParams: {} })}
            workingImageUrl={filterDisplayImage?.signedUrl ?? null}
          />
        ) : null}
        {/* Trace-section top-right submenu: Plus (no trace) opens the kind
            picker; Trash2 + Pencil (trace set) clear / re-open the configure
            dialog. Mirrors the Filter/Image bars. */}
        {editorSection === "trace" ? (
          <EditorTraceBar
            hasTrace={hasTrace}
            onOpen={() => {
              if (trace) setPendingTraceKindOpen(trace.kind)
              else setPendingTraceSelectionOpen(true)
            }}
            onDelete={() => setDeleteScope("trace")}
            deleteDisabled={!workflow.canMutate}
            colorCount={traceColorCount}
            onOpenColors={() => setColorsOpen(true)}
          />
        ) : null}
        {editorSection === "trace" ? (
          <ColorsDialog open={colorsOpen} onClose={() => setColorsOpen(false)} trace={trace} />
        ) : null}
        {editorSection === "trace" ? (
          <TraceSurfaceScope
            traceSourceImage={traceDialogSourceImage}
            onApplyTrace={handleApplyTraceGuarded}
            onPreviewTrace={handlePreviewTrace}
            isAddTraceDisabled={isAddTraceDisabled}
            isClearingTrace={workflow.isClearingTrace}
            isLoadingInitial={traceLoading}
            trace={trace ? { kind: trace.kind, params: trace.params } : null}
            onClearTrace={workflow.clearTrace}
            pendingKindOpen={pendingTraceKindOpen}
            onConsumePendingKindOpen={consumePendingTraceKindOpen}
            pendingSelectionOpen={pendingTraceSelectionOpen}
            onConsumePendingSelectionOpen={consumePendingTraceSelectionOpen}
            onConfigureCancelled={handleTraceConfigureCancelled}
          />
        ) : null}
        {editorSection === "colors" ? (
          <ColorsSurfaceScope trace={trace} />
        ) : null}
        {/* home + view bars — top-left vertical pill stack. */}
        <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-2">
          <EditorHomeBar />
          <EditorViewBar
            theme={{ value: toolbarTone, onToggle: toggleToolbarTheme }}
            viewOptions={
              editorSection === "trace" &&
              trace &&
              (trace.kind === "pixelate" || trace.kind === "circulate")
                ? {
                    traceOverlayVisible,
                    previewBitmapVisible,
                    numbersLayerVisible,
                    onTraceOverlayChange: setTraceOverlayVisible,
                    onPreviewBitmapChange: setPreviewBitmapVisible,
                    onNumbersLayerChange: setNumbersLayerVisible,
                  }
                : null
            }
          />
        </div>
        {/* Hidden master-image file input — one per shell; `openFilePicker`
            (below) clicks it. Lets "Add image" open the OS/mobile picker
            directly, no intermediate sheet. */}
        <input data-testid="master-image-file-input" {...imageUploader.getInputProps()} />
        {/* section stepper — top-centre section switcher (‹ [active] › + dropdown). */}
        <EditorSectionStepper activeSection={editorSection} onSelectSection={handleSectionTap} />
        </EditorToolbarToneProvider>
      </ProjectEditorLayout>

      <Dialog
        open={resetScope !== null}
        onOpenChange={(o) => (!o && !resetBusy ? setResetScope(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resetScope ? buildResetTitle({ scope: resetScope, hasFilter, hasTrace }) : ""}
            </DialogTitle>
            <DialogDescription>
              {resetScope ? buildResetMessage({ scope: resetScope, hasFilter, hasTrace }) : ""}
            </DialogDescription>
          </DialogHeader>
          {resetError ? (
            <div role="alert" className="text-sm text-destructive">{resetError}</div>
          ) : null}
          <DialogFooter>
            <AppButton
              type="button"
              variant="outline"
              onClick={() => setResetScope(null)}
              disabled={resetBusy}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              onClick={confirmReset}
              disabled={resetBusy}
            >
              {resetBusy ? "Removing…" : "Remove"}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leaf-delete confirm (Filter/Trace bar Trash) — same chrome + copy
          source as the reset dialog above, distinct only in scope/copy. */}
      <Dialog
        open={deleteScope !== null}
        onOpenChange={(o) => (!o && !deleteBusy2 ? setDeleteScope(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteScope ? buildDeleteTitle(deleteScope) : ""}</DialogTitle>
            <DialogDescription>
              {deleteScope ? buildDeleteLeafMessage(deleteScope) : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteScopeError ? (
            <div role="alert" className="text-sm text-destructive">{deleteScopeError}</div>
          ) : null}
          <DialogFooter>
            <AppButton
              type="button"
              variant="outline"
              onClick={() => setDeleteScope(null)}
              disabled={deleteBusy2}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              onClick={confirmDeleteScope}
              disabled={deleteBusy2}
            >
              {deleteBusy2 ? "Removing…" : "Remove"}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

