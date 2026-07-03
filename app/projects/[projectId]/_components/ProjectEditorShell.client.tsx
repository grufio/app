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
import { EditorHomeBar } from "@/features/editor/components/editor-home-bar"
import { EditorViewBar } from "@/features/editor/components/editor-view-bar"
import { EditorMenuBar } from "@/features/editor/components/editor-menu-bar"
import { EditorFuncsBar } from "@/features/editor/components/editor-funcs-bar"
import { EditorArtboardBar } from "@/features/editor/components/editor-artboard-bar"
import { EditorImageBar } from "@/features/editor/components/editor-image-bar"
import { EditorFilterBar } from "@/features/editor/components/editor-filter-bar"
import { EditorTraceBar } from "@/features/editor/components/editor-trace-bar"
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
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { useDisplaySize } from "@/lib/editor/hooks/use-display-size"
import { useMasterImageUploader } from "@/lib/editor/hooks/use-master-image-uploader"
import { useDedupingErrorToast } from "@/lib/editor/hooks/use-deduping-error-toast"
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
import { reportError } from "@/lib/monitoring/error-reporting"
import type { ImageState } from "@/lib/editor/imageState"
import type { MasterImage } from "@/lib/editor/hooks/use-master-image"
import { useMasterImage } from "@/lib/editor/hooks/use-master-image"
import { useProjectImages } from "@/lib/editor/hooks/use-project-images"
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
import { useDeleteMasterImageHandler } from "./editor-shell/use-delete-master-image-handler"
import { usePanelUIState } from "./editor-shell/use-panel-ui-state"
import { useImageActionRequests } from "./editor-shell/use-image-action-requests"

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
    imageBarActive,
    setImageBarActive,
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

  // Master-image uploader mounted once at the shell. Lets the "Add image"
  // affordances (menu bar + image bar) open the OS / mobile file picker
  // DIRECTLY on tap — no intermediate sheet. Only used when there is no
  // master image yet; when one exists the same icon opens the edit dialog.
  const imageUploader = useMasterImageUploader({ projectId, onUploaded: handleImageUploaded })
  const hasMasterImage = Boolean(masterImage)

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

  // Workflow-level filter error toasts at shell scope.
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

  const hasFilterSourceImage = Boolean(filterSourceImage)
  const isNewFilterActionBusy = filterImageLoading || workflow.isMutating || workflow.isSyncing
  const isAddFilterDisabled = !hasFilterSourceImage || isNewFilterActionBusy

  const isAddTraceDisabled = !hasFilterSourceImage || isNewFilterActionBusy || isApplyingTrace || isClearingTrace

  const {
    requestDeleteSelectedImage,
    requestDeleteGrid,
  } = useImageActionRequests({
    setSelectedNavId,
    projectImages,
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

  const handleDeleteMasterImage = useDeleteMasterImageHandler({
    masterImageId: masterImage?.id,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
    seedMasterImage,
    seedProjectImages,
    setDeleteError,
    setDeleteOpen,
    workflow,
  })

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
      await handleApplyTrace(args)
    },
    [displayTxU, masterImage, artboardWidthPx, artboardHeightPx, paddingPx, handleApplyTrace],
  )

  const handleTitleUpdated = useCallback((nextTitle: string) => setProject({ id: projectId, name: nextTitle }), [projectId, setProject])

  // Section locks. The Image section is locked while *any* downstream
  // artefact (filter / trace) derives from the master; the Filter
  // section is locked while a trace derives from the filter chain. The
  // derivation is pure (see `lib/editor/section-locks.ts`); the actual
  // cascade-delete behind an unlock is wired below.
  const hasFilter = filterStack.length > 0
  const hasTrace = Boolean(trace)

  const handleTraceKindTap = useCallback(
    (kind: RegisteredTraceId) => {
      setPendingTraceKindOpen(kind)
      // Ensure the trace surface scope (which hosts the configure dialog) is
      // mounted — idempotent when already on the trace section.
      setEditorSection("trace")
    },
    [setEditorSection, setPendingTraceKindOpen],
  )

  // Closing the configure dialog returns to the trace section so the
  // user lands back on the current trace state, not the Image/artboard
  // tab. The dialog itself unmounts via closeConfigure, so no stale draft
  // preview lingers.
  const handleTraceConfigureCancelled = useCallback(() => {
    setEditorSection("trace")
  }, [setEditorSection])

  const sectionLocks = useMemo(
    () => deriveSectionLocks({ hasFilter, hasTrace }),
    [hasFilter, hasTrace],
  )
  // Deleting the filter cascades the trace away (server-authoritative). When a
  // trace exists, confirm first; otherwise remove instantly.
  const [filterDeleteId, setFilterDeleteId] = useState<string | null>(null)
  const [filterDeleteBusy, setFilterDeleteBusy] = useState(false)
  const [filterDeleteError, setFilterDeleteError] = useState<string | null>(null)
  // Filter picker (top-right "+" / edit) open state — the Filter section's
  // sole dialog. Local, mounted only while the Filter section is active.
  const [filterSelectionOpen, setFilterSelectionOpen] = useState(false)

  const handleRemoveFilter = useCallback(
    (id: string) => {
      if (hasTrace) {
        setFilterDeleteError(null)
        setFilterDeleteId(id)
        return
      }
      void workflow.removeFilter(id)
    },
    [hasTrace, workflow],
  )

  const confirmFilterDelete = useCallback(async () => {
    if (!filterDeleteId || filterDeleteBusy) return
    setFilterDeleteBusy(true)
    setFilterDeleteError(null)
    try {
      await workflow.removeFilter(filterDeleteId)
      setFilterDeleteId(null)
    } catch (err) {
      setFilterDeleteError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setFilterDeleteBusy(false)
    }
  }, [filterDeleteId, filterDeleteBusy, workflow])

  // Map each applied filter kind → the instance id to target for delete in the
  // top-left "+" menu. Later wins, so this is the last-applied instance of a
  // repeated kind. A kind is "active" in the menu iff it's a key here.
  const activeFilterByKind = useMemo(() => {
    const m: Partial<Record<RegisteredFilterId, string>> = {}
    for (const f of filterStack) {
      if (f.filterType !== "unknown") m[f.filterType] = f.id
    }
    return m
  }, [filterStack])

  // The funcs bar (`EditorFuncsBar`) is still temporarily hidden —
  // re-integrated step by step. The tools bar (`EditorToolsBar`) is
  // back (right side, below the artboard bar). Flip this flag to re-enable
  // the funcs bar too.
  const showLegacyToolbars = false as boolean

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
              // Canvas "Processing..." overlay while a filter or trace apply runs.
              processing={workflow.isApplyingFilter || isApplyingTrace}
              toolbar={stageToolbar}
              // The canvas-editing tools (zoom / hand / crop) belong to the
              // Image context only — i.e. the artboard section with the Image
              // action active. The artboard/grid context and every other
              // section hide them.
              showToolsBar={editorSection === "artboard" && imageBarActive}
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
            deleteBusy={deleteBusy}
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
        {showLegacyToolbars ? (
          <EditorFuncsBar
            activeSection={editorSection}
            onTraceKindTap={handleTraceKindTap}
            activeTraceKind={trace?.kind ?? null}
            onDeleteTrace={handleClearTrace}
            activeFilterByKind={activeFilterByKind}
            onApplyFilterKind={(k) => handleApplyFilter({ filterType: k, filterParams: {} })}
            onRemoveFilter={handleRemoveFilter}
            isAddFilterDisabled={isAddFilterDisabled}
            filterLocked={sectionLocks.filterLocked}
            hasGrid={hasGrid}
            hasMasterImage={Boolean(masterImage)}
            onCreateGrid={async () => {
              await createGrid()
              setGridVisible(true)
            }}
            onOpenArtboard={(dialog) => setPendingArtboardDialog(dialog)}
            imageLocked={sectionLocks.imageLocked}
          />
        ) : null}

        {/* Artboard-section top-right submenu. Default: Artboard / Grid
            (2 × 40px circles). When the Image action is the active context,
            it swaps to a single Image icon (add / edit) instead. */}
        {editorSection === "artboard" ? (
          imageBarActive ? (
            <EditorImageBar
              hasImage={hasMasterImage}
              onOpen={() =>
                hasMasterImage ? setPendingArtboardDialog("image") : imageUploader.openFilePicker()
              }
              onDelete={requestDeleteSelectedImage}
            />
          ) : (
            <EditorArtboardBar onOpenDialog={(kind) => setPendingArtboardDialog(kind)} />
          )
        ) : null}
        {editorSection === "artboard" ? (
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
            imageLocked={sectionLocks.imageLocked}
            masterImageLoading={masterImageLoading}
            deleteBusy={deleteBusy}
            restoreBusy={workflow.isRestoring}
            canvasRef={canvasRef}
            onRequestRestore={() => setRestoreOpen(true)}
            onRequestDelete={requestDeleteSelectedImage}
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
            onDelete={() => {
              const id = filterStack[0]?.id
              if (id) handleRemoveFilter(id)
            }}
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
            onDelete={() => void handleClearTrace()}
          />
        ) : null}
        {editorSection === "trace" ? (
          <TraceSurfaceScope
            traceSourceImage={traceDialogSourceImage}
            onApplyTrace={handleApplyTraceGuarded}
            isAddTraceDisabled={isAddTraceDisabled}
            isClearingTrace={isClearingTrace}
            isLoadingInitial={traceLoading}
            trace={trace ? { kind: trace.kind, params: trace.params } : null}
            onClearTrace={handleClearTrace}
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
              editorSection === "trace" && trace && (trace.kind === "pixelate" || trace.kind === "circulate")
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
        {/* menu bar — bottom-centre section switcher + Image dialog opener. */}
        <EditorMenuBar
          activeSection={editorSection}
          onSelectSection={handleSectionTap}
          hasImage={hasMasterImage}
          imageActive={imageBarActive}
          // The Image action activates its own context: switch to the artboard
          // section (where the dialog host mounts) and show the top-right Image
          // icon. The top-right icon is where "Add image" (→ file picker) and
          // "Edit image" (→ dialog) actually fire — see EditorImageBar. The
          // menu-bar icon only navigates; it must NOT open the picker itself
          // (that dropped the navigation for the no-master case).
          onOpenImage={() => {
            setEditorSection("artboard")
            setImageBarActive(true)
          }}
        />
        </EditorToolbarToneProvider>
      </ProjectEditorLayout>

      <Dialog
        open={filterDeleteId !== null}
        onOpenChange={(o) => (!o && !filterDeleteBusy ? setFilterDeleteId(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete filter?</DialogTitle>
            <DialogDescription>
              The trace is built on the filter, so it will be deleted too.
            </DialogDescription>
          </DialogHeader>
          {filterDeleteError ? (
            <div role="alert" className="text-sm text-destructive">{filterDeleteError}</div>
          ) : null}
          <DialogFooter>
            <AppButton
              type="button"
              variant="outline"
              onClick={() => setFilterDeleteId(null)}
              disabled={filterDeleteBusy}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              onClick={confirmFilterDelete}
              disabled={filterDeleteBusy}
            >
              {filterDeleteBusy ? "Deleting…" : "Delete filter + trace"}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

