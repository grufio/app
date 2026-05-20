"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { applyProjectImageFilter, cropImageVariant, removeProjectImageFilter, restoreInitialMasterImage } from "@/lib/api/project-images"
import { isOperationError, type OperationError } from "@/lib/api/operation-error"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import { useImageWorkflowMachine } from "@/lib/editor/machines/use-image-workflow-machine"
import type { ImageState } from "@/lib/editor/hooks/use-image-state"
import { useImageState } from "@/lib/editor/hooks/use-image-state"

/**
 * Coerce a heterogeneous error slot to `OperationError | null`. Used
 * by the workflow adapter where the machine emits `OperationError`
 * but legacy hook outputs (e.g. `filterImageError`) are still strings.
 * Falsy inputs collapse to null so callers can do null-safe priority
 * picks without `||`-string-truthiness footguns (a non-null
 * OperationError object is always truthy regardless of `.message`).
 */
function coerceToOperationError(value: OperationError | string | null | undefined): OperationError | null {
  if (!value) return null
  if (isOperationError(value)) return value
  return { stage: "unknown", message: String(value) }
}

export type EditorImageSourceState =
  | { status: "loading"; image: null; error: "" }
  | { status: "ready"; image: { id: string; signedUrl: string; width_px: number; height_px: number; name: string }; error: "" }
  | { status: "empty"; image: null; error: "" }
  | { status: "error"; image: null; error: string }

export function deriveEditorSourceSnapshot(args: {
  masterImageLoading: boolean
  filterImageLoading: boolean
  uploadSyncing: boolean
  filterImageLoadedOnce: boolean
  /** Trace-free raster source (working-copy or filter chain tip
   * without trace). After PR #109 the canvas always renders this,
   * so the workflow-source identity tracks it. The trace-aware
   * `filterDisplayImage` is used only for the SVG overlay. */
  filterDisplayImageWithoutTrace: { id: string; signedUrl: string; width_px: number; height_px: number; name: string } | null
  filterImageError: string
  masterImageError: string
  masterImage: { id?: string; signedUrl?: string; name?: string; width_px?: number; height_px?: number } | null
  filterImageEmptyReason: "no_active_image" | null
}): EditorImageSourceState {
  const {
    masterImageLoading,
    filterImageLoading,
    uploadSyncing,
    filterImageLoadedOnce,
    filterDisplayImageWithoutTrace,
    filterImageError,
    masterImageError,
    masterImage,
    filterImageEmptyReason,
  } = args
  if (masterImageLoading || filterImageLoading || uploadSyncing || !filterImageLoadedOnce) {
    return { status: "loading", image: null, error: "" }
  }
  if (filterDisplayImageWithoutTrace) {
    return {
      status: "ready",
      image: {
        id: filterDisplayImageWithoutTrace.id,
        signedUrl: filterDisplayImageWithoutTrace.signedUrl,
        width_px: filterDisplayImageWithoutTrace.width_px,
        height_px: filterDisplayImageWithoutTrace.height_px,
        name: filterDisplayImageWithoutTrace.name,
      },
      error: "",
    }
  }
  if (filterImageError) return { status: "error", image: null, error: filterImageError }
  if (masterImageError) return { status: "error", image: null, error: masterImageError }
  if (masterImage && filterImageEmptyReason === "no_active_image") {
    return { status: "empty", image: null, error: "" }
  }
  if (masterImage) {
    return {
      status: "error",
      image: null,
      error: "Working image target is unresolved. Refresh editor state.",
    }
  }
  return { status: "empty", image: null, error: "" }
}

export function useEditorWorkflowAdapter(args: {
  projectId: string
  initialImageState: ImageState | null
  masterImage: { id?: string; signedUrl?: string; name?: string; width_px?: number; height_px?: number } | null
  masterImageLoading: boolean
  masterImageError: string
  filterDisplayImage: { id: string; signedUrl: string; width_px: number; height_px: number; name: string } | null
  /** Trace-free counterpart to `filterDisplayImage`. Used as the
   * source for `applyFilter` because filters operate on bitmaps —
   * if a project has an active trace, `filterDisplayImage.id`
   * points to the trace SVG, which the pixelate Python service
   * can't decode. The without-trace variant is always the real
   * raster filter chain tip. */
  filterDisplayImageWithoutTrace: { id: string; signedUrl: string; width_px: number; height_px: number; name: string } | null
  filterImageLoading: boolean
  filterImageLoadedOnce: boolean
  filterImageError: string
  filterImageEmptyReason: "no_active_image" | null
  refreshMasterImage: () => Promise<void>
  refreshProjectImages: () => Promise<void>
  refreshFilterImage: () => Promise<void>
  seedMasterImage: (next: { id: string; signedUrl: string; width_px: number; height_px: number; dpi: number | null; name: string } | null) => void
}) {
  const {
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
    seedMasterImage,
  } = args
  // `uploadSyncing` used to guard the source-snapshot loading state
  // while the upload handler waited on workflow.refreshAndWait(). The
  // handler no longer blocks on a refresh round-trip — the seeded
  // master is authoritative, and the loading state of the deferred
  // hooks (filterImageLoading, masterImageLoading) already covers the
  // background refresh window. Kept as a constant `false` so the
  // existing deriveEditorSourceSnapshot signature stays stable.
  const uploadSyncing = false
  const [uploadSyncError, setUploadSyncError] = useState<unknown>(null)
  const activeSourceImageIdRef = useRef<string | null>(null)
  /** Source ID for filter-apply operations. Tracks the trace-free
   * filter chain tip (or working copy) because filters consume a
   * bitmap input — feeding the trace SVG to pixelate's Python
   * service breaks the decode step. */
  const filterApplySourceIdRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshQueuedRef = useRef(false)

  const sourceSnapshot = useMemo<EditorImageSourceState>(
    () =>
      deriveEditorSourceSnapshot({
        masterImageLoading,
        filterImageLoading,
        uploadSyncing,
        filterImageLoadedOnce,
        filterDisplayImageWithoutTrace,
        filterImageError,
        masterImageError,
        masterImage,
        filterImageEmptyReason,
      }),
    [filterDisplayImageWithoutTrace, filterImageError, filterImageEmptyReason, filterImageLoadedOnce, filterImageLoading, masterImage, masterImageError, masterImageLoading, uploadSyncing]
  )

  useEffect(() => {
    activeSourceImageIdRef.current = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  }, [sourceSnapshot])

  useEffect(() => {
    // Prefer the trace-free variant when present; fall back to the
    // trace-aware ID if the without-trace payload hasn't loaded yet
    // (transient on first load). The filter-apply happens after the
    // user clicks Apply, by which point both have settled.
    filterApplySourceIdRef.current = filterDisplayImageWithoutTrace?.id ?? (sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null)
  }, [filterDisplayImageWithoutTrace, sourceSnapshot])

  const activeSnapshotImageId = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  // State is anchored at master.id (PR #124). The hook only owns the
  // save path; the SSR seed (`initialImageState`) is passed through
  // verbatim. There is no client-side mount-load because SSR already
  // delivered the persisted row.
  const { initialImageTransform, saveImageState } = useImageState(projectId, initialImageState)

  const refreshEditorDataOnce = useCallback(async () => {
    // No `loadImageState()` here: state is project-wide and immutable
    // by filter/trace/crop apply (none of those touch the master-anchored
    // row). The current state stays correct across these operations.
    // Each refresh hits an independent endpoint keyed only by projectId
    // and writes to its own isolated useState — no ordering constraint.
    await Promise.all([
      refreshMasterImage(),
      refreshProjectImages(),
      refreshFilterImage(),
    ])
  }, [refreshFilterImage, refreshMasterImage, refreshProjectImages])

  const refreshEditorData = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return refreshInFlightRef.current
    }
    const run = async () => {
      do {
        refreshQueuedRef.current = false
        await refreshEditorDataOnce()
      } while (refreshQueuedRef.current)
    }
    const inFlight = run().finally(() => {
      if (refreshInFlightRef.current === inFlight) {
        refreshInFlightRef.current = null
      }
    })
    refreshInFlightRef.current = inFlight
    return inFlight
  }, [refreshEditorDataOnce])

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
    async (op: { filterType: RegisteredFilterId; filterParams: Record<string, unknown> }) => {
      // Use the trace-free source so filters stack on the raster
      // filter chain, not on a trace SVG.
      const sourceImageId = filterApplySourceIdRef.current ?? activeSourceImageIdRef.current
      if (!sourceImageId) {
        throw new Error("No active image available for filtering.")
      }
      await applyProjectImageFilter({
        projectId,
        filterType: op.filterType,
        filterParams: {
          source_image_id: sourceImageId,
          ...op.filterParams,
        },
      })
    },
    [projectId]
  )
  const saveTransformService = useCallback(
    async ({ transform }: { transform: { xPxU?: bigint; yPxU?: bigint; widthPxU: bigint; heightPxU: bigint; rotationDeg: number } }) => {
      await saveImageState(transform)
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

  const handleApplyFilter = useCallback(
    async (op: { filterType: RegisteredFilterId; filterParams: Record<string, unknown> }) => {
      await workflow.applyFilter(op)
    },
    [workflow]
  )
  const seededMasterIdRef = useRef<string | null>(null)
  const handleImageUploaded = useCallback(
    async (uploadedMaster: { id: string; signedUrl: string; width_px: number; height_px: number; dpi: number | null; name: string } | null) => {
      // Upload path is fully synchronous from the UI's standpoint once
      // the POST resolves: the master snapshot in the response is
      // authoritative. We seed it and let the source-snapshot useEffect
      // in the workflow machine pick the new image up through normal
      // React-tree flow — no REFRESH event, no syncing state, no
      // 20-second wait that can time out when any single dependent
      // hook is slow.
      //
      // The two remaining derived slices (project_images, filter_image)
      // are refreshed in the background. UI features that depend on
      // them surface their own loading/error states; nothing here
      // should block on them. Background-hook failures have their own
      // surfaces (filterImageError etc.) — we don't double-surface
      // them via uploadSyncError.
      workflow.dismissError()
      if (uploadedMaster?.id) {
        seedMasterImage(uploadedMaster)
        seededMasterIdRef.current = uploadedMaster.id
      }
      setUploadSyncError(null)
      void Promise.allSettled([refreshProjectImages(), refreshFilterImage()])
    },
    [refreshFilterImage, refreshProjectImages, seedMasterImage, workflow],
  )

  // OperationError-typed composition. Order: persistence has highest
  // priority (sync failures override op failures), then filter op,
  // then the legacy filterImage string slot (coerced if non-empty).
  // `??` (not `||`) is required: a non-null OperationError object is
  // always truthy regardless of .message, so `||` would short-circuit
  // incorrectly.
  const filterOperationError: OperationError | null =
    workflow.lastOperation === "filter_apply" || workflow.lastOperation === "filter_remove"
      ? (workflow.operationError ?? null)
      : null
  const restoreOperationError: OperationError | null =
    workflow.lastOperation === "restore" ? (workflow.operationError ?? null) : null
  const workflowFilterPanelError: OperationError | null =
    workflow.persistenceError ?? filterOperationError ?? coerceToOperationError(filterImageError)

  return {
    sourceSnapshot,
    initialImageTransform,
    /** Raw await-able save from `useImageState`. The workflow
     * machine's `saveTransform` event is fire-and-forget; trace's
     * apply path needs to await persistence directly to close the
     * resize→apply race (see use-trace-handlers). */
    saveImageState,
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    seededMasterIdRef,
    uploadSyncError,
    filterOperationError,
    restoreOperationError,
    workflowFilterPanelError,
  }
}
