"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { applyProjectImageFilter, cropImageVariant, deleteMasterImageWithCascade, getMasterImage, getOrCreateFilterWorkingCopy, listMasterImages, removeProjectImageFilter, restoreInitialMasterImage } from "@/lib/api/project-images"
import { applyProjectTrace, clearProjectTrace } from "@/lib/api/project-trace"
import { isOperationError, type OperationError } from "@/lib/api/operation-error"
import { toFilterReadModelData, type FilterReadModelData } from "@/lib/editor/filter-working-image"
import { toMasterImage, type MasterImage } from "@/lib/editor/master-image"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { useImageWorkflowMachine } from "@/lib/editor/machines/use-image-workflow-machine"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"
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

/** Result of one editor-data refresh: the machine-owned master + filter
 * slices (read-model phases B/C). Fed into `syncing.onDone`. */
type RefreshResult = { master: MasterImage | null; filter: FilterReadModelData }

/** Fetch + map the filter working copy, catching errors into an error slice so
 * a filter fetch failure never rejects the whole refresh (mirrors the old
 * hook, which caught internally and surfaced `error` rather than throwing). */
async function fetchFilterData(projectId: string): Promise<FilterReadModelData> {
  try {
    return toFilterReadModelData(await getOrCreateFilterWorkingCopy(projectId))
  } catch (e) {
    reportClientError(e, {
      scope: "editor",
      code: "FILTER_WORKING_IMAGE_LOAD_FAILED",
      stage: "load",
      context: { projectId },
    })
    return {
      image: null,
      imageWithoutTrace: null,
      stack: [],
      emptyReason: null,
      error: e instanceof Error ? e.message : "Failed to load filter working image",
    }
  }
}

export function useEditorWorkflowAdapter(args: {
  projectId: string
  /** SSR-seeded master for the machine (read-model phase B). The machine owns
   * the live master; the shell reads it back from `workflow.master`. */
  initialMaster: MasterImage | null
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
    refreshTrace,
    saveImageState,
    getCurrentImageTx,
  } = args
  const [uploadSyncError, setUploadSyncError] = useState<unknown>(null)
  const activeSourceImageIdRef = useRef<string | null>(null)
  /** Source ID for filter-apply operations. Tracks the trace-free
   * filter chain tip (or working copy) because filters consume a
   * bitmap input — feeding the trace SVG to pixelate's Python
   * service breaks the decode step. */
  const filterApplySourceIdRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<RefreshResult> | null>(null)
  const refreshQueuedRef = useRef(false)

  const refreshEditorDataOnce = useCallback(async (): Promise<RefreshResult> => {
    // No `loadImageState()` here: state is project-wide and immutable
    // by filter/trace/crop apply (none of those touch the master-anchored
    // row). The current state stays correct across these operations.
    // Each refresh hits an independent endpoint keyed only by projectId.
    // `refreshTrace` is included so a filter-remove (which cascades the trace
    // server-side) leaves the client `trace`/`hasTrace` consistent.
    // NOTE: project-images is NOT refreshed here — the master-images list only
    // changes on upload/delete (i.e. a master-id change), which the shell's
    // cascade effect reloads via `loadProjectImages`. Filter/trace/crop don't
    // touch the list, so re-fetching it after every mutation is wasteful.
    // The master AND filter are fetched here (machine-owned, phases B/C) and
    // returned so the machine's `syncing.onDone` assigns them into context and
    // re-derives the source. `getOrCreateFilterWorkingCopy` is side-effecting
    // (it creates the working copy); the machine's single `syncing` invoke is
    // the single-flight point.
    const [payload, filter] = await Promise.all([
      getMasterImage(projectId).catch(() => null),
      fetchFilterData(projectId),
      refreshTrace(),
    ])
    return { master: payload?.exists ? toMasterImage(payload) : null, filter }
  }, [projectId, refreshTrace])

  const refreshEditorData = useCallback(async (): Promise<RefreshResult> => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return refreshInFlightRef.current
    }
    const run = async (): Promise<RefreshResult> => {
      let last: RefreshResult = { master: null, filter: { image: null, imageWithoutTrace: null, stack: [], emptyReason: null, error: "" } }
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

  // `source` is now derived INSIDE the machine from the master + filter slices
  // (read-model phase C) — no more adapter memo / SOURCE_SNAPSHOT round-trip.
  // The shell reads it back as `workflow.readModel`.
  const editorImageSource = workflow.readModel
  const { master, masterLoading } = workflow
  const filterImageWithoutTrace = workflow.filter.imageWithoutTrace
  useEffect(() => {
    activeSourceImageIdRef.current =
      editorImageSource.status === "ready" && editorImageSource.image ? editorImageSource.image.id : null
  }, [editorImageSource])
  useEffect(() => {
    filterApplySourceIdRef.current =
      filterImageWithoutTrace?.id ??
      (editorImageSource.status === "ready" && editorImageSource.image ? editorImageSource.image.id : null)
  }, [filterImageWithoutTrace, editorImageSource])

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
  const { setProjectImages, setMaster, setFilter } = workflow
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
  // is handled by the machine's refreshAll → assignFromRefresh.
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
  // Initial filter-working-image load (read-model phase C). Always fetched on
  // mount (no SSR seed — mirrors the old hook, which fetched on mount).
  // `getOrCreateFilterWorkingCopy` is side-effecting; the mount effect + the
  // machine's `syncing` are the only fetch points. Post-mutation refresh flows
  // through refreshAll → assignFromRefresh.
  const loadFilter = useCallback(async () => {
    setFilter({ loading: true, error: "" })
    setFilter({ ...(await fetchFilterData(projectId)), loading: false, loadedOnce: true })
  }, [projectId, setFilter])
  useEffect(() => {
    void loadFilter()
  }, [loadFilter])
  // Self-heal a diverged read-model: the canvas source can be `ready` (the
  // filter working-copy resolved) while `master` is transiently null (a
  // signed-URL failure / stale `exists:false` / cold load with no SSR seed).
  // That would show the photo AND the "Add image" button at once. Re-fetch the
  // master exactly once per divergence (ref-guarded — no fetch loop); the guard
  // resets as soon as a master is present so a later divergence can retry.
  const masterRecoveryTriedRef = useRef(false)
  useEffect(() => {
    if (master) {
      masterRecoveryTriedRef.current = false
      return
    }
    if (editorImageSource.status === "ready" && !masterLoading && !masterRecoveryTriedRef.current) {
      masterRecoveryTriedRef.current = true
      void loadMaster()
    }
  }, [editorImageSource.status, master, masterLoading, loadMaster])
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
  // then the machine's filter read-model error slot (coerced if non-empty).
  // `??` (not `||`) is required: a non-null OperationError object is
  // always truthy regardless of .message, so `||` would short-circuit
  // incorrectly.
  // `filter_apply` is intentionally excluded: the FilterSelectionController now
  // awaits the apply and toasts failures in its own catch (like the trace
  // dialogs), so surfacing it here too would double-toast. `filter_remove` is
  // fire-and-forget with no dialog, so it still routes through this channel.
  const filterOperationError: OperationError | null =
    workflow.lastOperation === "filter_remove"
      ? (workflow.operationError ?? null)
      : null
  const restoreOperationError: OperationError | null =
    workflow.lastOperation === "restore" ? (workflow.operationError ?? null) : null
  const workflowFilterPanelError: OperationError | null =
    workflow.persistenceError ?? filterOperationError ?? coerceToOperationError(workflow.filter.error)

  return {
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
