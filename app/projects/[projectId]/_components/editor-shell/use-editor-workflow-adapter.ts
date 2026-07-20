"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { applyProjectImageFilter, cropImageVariant, deleteMasterImageWithCascade, getMasterImage, listMasterImages, removeProjectImageFilter, restoreInitialMasterImage } from "@/lib/api/project-images"
import { applyProjectTrace, clearProjectTrace } from "@/lib/api/project-trace"
import { isOperationError, type OperationError } from "@/lib/api/operation-error"
import { toMasterImage, type MasterImage } from "@/lib/editor/master-image"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { useImageWorkflowMachine } from "@/lib/editor/machines/use-image-workflow-machine"
import type { ImageState } from "@/lib/editor/imageState"

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
  masterImage: { id?: string; masterRowId?: string | null; signedUrl?: string; name?: string; width_px?: number; height_px?: number } | null
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
  /** SSR-seeded master for the machine (read-model phase B). The machine owns
   * the live master; the shell reads it back from `workflow.master`. */
  initialMaster: MasterImage | null
  /** Trace-free filter chain tip. Used as the source for
   * `applyFilter` because filters operate on bitmaps — if a project
   * has an active trace, the filter chain tip points to the trace
   * SVG, which the pixelate Python service can't decode. The
   * without-trace variant is always the real raster filter chain
   * tip. (The shell still receives a `filterDisplayImage` from
   * `useFilterImage` for the canvas overlay path, but the adapter
   * doesn't need it.) */
  filterDisplayImageWithoutTrace: { id: string; signedUrl: string; width_px: number; height_px: number; name: string } | null
  filterImageLoading: boolean
  filterImageLoadedOnce: boolean
  filterImageError: string
  filterImageEmptyReason: "no_active_image" | null
  refreshFilterImage: () => Promise<void>
  /** Re-fetch the trace row. Part of "refresh all editor data": the trace is
   * downstream of the filter (removing a filter cascades it server-side), so
   * every workflow mutation must re-fetch it or `hasTrace` goes stale. */
  refreshTrace: () => Promise<void>
  /** Await-able persisted transform save, owned by `useDisplaySize` (the
   * single authoritative display-size source). The workflow machine wraps
   * it as the `saveTransform` service; the shell also awaits it directly
   * on trace apply. The adapter no longer owns a transform mirror — the
   * display source does. */
  saveImageState: (t: ImageState) => Promise<void>
  /** Reads the one authoritative canvas transform (incl. persisted rotation).
   * The `applyTrace` service persists it before running the trace so the trace
   * is computed against the user's current display size (resize→apply race). */
  getCurrentImageTx: () => ImageState | null
}) {
  const {
    projectId,
    initialMaster,
    filterDisplayImageWithoutTrace,
    filterImageLoading,
    filterImageLoadedOnce,
    filterImageError,
    filterImageEmptyReason,
    refreshFilterImage,
    refreshTrace,
    saveImageState,
    getCurrentImageTx,
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
  const refreshInFlightRef = useRef<Promise<{ master: MasterImage | null }> | null>(null)
  const refreshQueuedRef = useRef(false)

  const refreshEditorDataOnce = useCallback(async (): Promise<{ master: MasterImage | null }> => {
    // No `loadImageState()` here: state is project-wide and immutable
    // by filter/trace/crop apply (none of those touch the master-anchored
    // row). The current state stays correct across these operations.
    // Each refresh hits an independent endpoint keyed only by projectId
    // and writes to its own isolated useState — no ordering constraint.
    // `refreshTrace` is included so a filter-remove (which cascades the trace
    // server-side) leaves the client `trace`/`hasTrace` consistent.
    // NOTE: project-images is NOT refreshed here — the master-images list only
    // changes on upload/delete (i.e. a master-id change), which the shell's
    // cascade effect reloads via `loadProjectImages`. Filter/trace/crop don't
    // touch the list, so re-fetching it after every mutation is wasteful.
    // The master IS fetched here (machine-owned, phase B) and returned so the
    // machine's `syncing.onDone` assigns it into context.
    const [payload] = await Promise.all([
      getMasterImage(projectId).catch(() => null),
      refreshFilterImage(),
      refreshTrace(),
    ])
    return { master: payload?.exists ? toMasterImage(payload) : null }
  }, [projectId, refreshFilterImage, refreshTrace])

  const refreshEditorData = useCallback(async (): Promise<{ master: MasterImage | null }> => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return refreshInFlightRef.current
    }
    const run = async (): Promise<{ master: MasterImage | null }> => {
      let last: { master: MasterImage | null } = { master: null }
      do {
        refreshQueuedRef.current = false
        last = await refreshEditorDataOnce()
      } while (refreshQueuedRef.current)
      return last
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
  const applyTraceService = useCallback(
    async ({ kind, params }: { kind: RegisteredTraceId; params: Record<string, unknown> }) => {
      // Persist the current transform first so the trace is computed against the
      // user's current display size (resize→apply race), then run the trace.
      const currentTx = getCurrentImageTx()
      if (currentTx) await saveImageState(currentTx)
      await applyProjectTrace({ projectId, kind, params })
    },
    [projectId, getCurrentImageTx, saveImageState]
  )
  const clearTraceService = useCallback(async () => {
    // Only remove the trace. The machine's `syncing` refresh (refreshAll)
    // restores the filter-chain tip; NO master-image reload here.
    await clearProjectTrace(projectId)
  }, [projectId])
  const uploadMasterService = useCallback(
    // The instant master seed now happens in the machine (the IMAGE_UPLOAD
    // transition's `assignMasterFromUpload` action reads the event payload), so
    // this service is a no-op — the mutation flow is transition + syncing.
    async (_args: { master: UploadedMasterSnapshot }) => {},
    []
  )
  const deleteMasterService = useCallback(async () => {
    // Atomic cascade delete → empty is the stable fixed point. The machine's
    // IMAGE_DELETE `clearMaster` action flips context.master to null instantly;
    // `syncing` then re-confirms.
    await deleteMasterImageWithCascade(projectId)
  }, [projectId])
  const workflowServices = useMemo(
    () => ({
      removeFilter: removeFilterService,
      applyFilter: applyFilterService,
      applyCrop: applyCropService,
      restoreBase: restoreBaseService,
      refreshAll: refreshEditorData,
      saveTransform: saveTransformService,
      applyTrace: applyTraceService,
      clearTrace: clearTraceService,
      uploadMaster: uploadMasterService,
      deleteMaster: deleteMasterService,
    }),
    [applyCropService, applyFilterService, applyTraceService, clearTraceService, deleteMasterService, refreshEditorData, removeFilterService, restoreBaseService, saveTransformService, uploadMasterService]
  )

  const workflow = useImageWorkflowMachine({
    projectId,
    services: workflowServices,
    initialMaster,
  })

  // Derive the source snapshot AFTER the machine exists, from the machine-owned
  // master (+ the filter hook), and push it back in via `setSource`. It can't be
  // a machine arg (create-time cycle: master lives in context). The memo is
  // stable when its inputs are (master keeps identity via signature dedup), so
  // this does NOT loop.
  const { master, masterLoading, masterError, setSource } = workflow
  const sourceSnapshot = useMemo<EditorImageSourceState>(
    () =>
      deriveEditorSourceSnapshot({
        masterImageLoading: masterLoading,
        filterImageLoading,
        uploadSyncing,
        filterImageLoadedOnce,
        filterDisplayImageWithoutTrace,
        filterImageError,
        masterImageError: masterError,
        masterImage: master,
        filterImageEmptyReason,
      }),
    [filterDisplayImageWithoutTrace, filterImageError, filterImageEmptyReason, filterImageLoadedOnce, filterImageLoading, master, masterError, masterLoading, uploadSyncing]
  )
  useEffect(() => {
    setSource(sourceSnapshot)
  }, [sourceSnapshot, setSource])
  useEffect(() => {
    activeSourceImageIdRef.current = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  }, [sourceSnapshot])
  useEffect(() => {
    filterApplySourceIdRef.current = filterDisplayImageWithoutTrace?.id ?? (sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null)
  }, [filterDisplayImageWithoutTrace, sourceSnapshot])

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
  // Own the project-images list in the machine (read-model migration phase A):
  // fetch it here and feed the machine context. The shell's cascade effect
  // drives it on mount and whenever the master id changes (upload/replace/
  // delete) — the only events that change the master-images list.
  // Depend on the STABLE `setProjectImages` sender, not the whole `workflow`
  // object (which is a fresh identity every render) — otherwise this callback,
  // and the shell effect that depends on it, would re-run every render → loop.
  const { setProjectImages, setMaster } = workflow
  const loadProjectImages = useCallback(async () => {
    try {
      const payload = await listMasterImages(projectId)
      setProjectImages(payload.items)
    } catch {
      setProjectImages([])
    }
  }, [projectId, setProjectImages])
  // Initial master load (read-model phase B): skip when SSR already seeded the
  // machine (mirrors the old hook's skip-initial-fetch). Post-mutation refresh
  // is handled by the machine's refreshAll → assignMasterFromRefresh.
  const loadMaster = useCallback(async () => {
    setMaster({ master: null, loading: true, error: "" })
    try {
      const payload = await getMasterImage(projectId)
      setMaster({ master: payload?.exists ? toMasterImage(payload) : null, loading: false, error: "" })
    } catch (e) {
      setMaster({ master: null, loading: false, error: e instanceof Error ? e.message : "Failed to load image" })
    }
  }, [projectId, setMaster])
  useEffect(() => {
    if (initialMaster?.signedUrl) return
    void loadMaster()
  }, [initialMaster?.signedUrl, loadMaster])
  const handleImageUploaded = useCallback(
    async (uploadedMaster: UploadedMasterSnapshot | null) => {
      // Drive the post-upload seed + reconcile through the machine
      // (`uploadingMaster → syncing → idle`): the service seeds instantly for
      // fast UX and `refreshAll` reconciles the derived slices — no out-of-band
      // fire-and-forget refresh. `uploadMaster` is fire-and-forget on purpose
      // (the UI reads the seed from the source snapshot; it must not block on
      // syncing). A null payload (defensive) just requests a refresh.
      setUploadSyncError(null)
      if (uploadedMaster?.id) {
        workflow.uploadMaster(uploadedMaster)
      } else {
        workflow.refresh()
      }
    },
    [workflow],
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
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    loadProjectImages,
    uploadSyncError,
    filterOperationError,
    restoreOperationError,
    workflowFilterPanelError,
  }
}
