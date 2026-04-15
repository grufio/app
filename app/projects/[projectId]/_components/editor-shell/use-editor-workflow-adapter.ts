"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { applyProjectImageFilter, cropImageVariant, removeProjectImageFilter, restoreInitialMasterImage } from "@/lib/api/project-images"
import { useImageWorkflowMachine } from "@/lib/editor/machines/use-image-workflow-machine"
import type { ImageState } from "@/lib/editor/use-image-state"
import { useImageState } from "@/lib/editor/use-image-state"

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
  filterDisplayImage: { id: string; signedUrl: string; width_px: number; height_px: number; name: string } | null
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
    filterDisplayImage,
    filterImageError,
    masterImageError,
    masterImage,
    filterImageEmptyReason,
  } = args
  if (masterImageLoading || filterImageLoading || uploadSyncing || !filterImageLoadedOnce) {
    return { status: "loading", image: null, error: "" }
  }
  if (filterDisplayImage) {
    return {
      status: "ready",
      image: {
        id: filterDisplayImage.id,
        signedUrl: filterDisplayImage.signedUrl,
        width_px: filterDisplayImage.width_px,
        height_px: filterDisplayImage.height_px,
        name: filterDisplayImage.name,
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
  filterImageLoading: boolean
  filterImageLoadedOnce: boolean
  filterImageError: string
  filterImageEmptyReason: "no_active_image" | null
  refreshMasterImage: () => Promise<void>
  refreshProjectImages: () => Promise<void>
  refreshFilterImage: () => Promise<void>
}) {
  const {
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
  } = args
  const [uploadSyncing, setUploadSyncing] = useState(false)
  const activeSourceImageIdRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshQueuedRef = useRef(false)

  const sourceSnapshot = useMemo<EditorImageSourceState>(
    () =>
      deriveEditorSourceSnapshot({
        masterImageLoading,
        filterImageLoading,
        uploadSyncing,
        filterImageLoadedOnce,
        filterDisplayImage,
        filterImageError,
        masterImageError,
        masterImage,
        filterImageEmptyReason,
      }),
    [filterDisplayImage, filterImageError, filterImageEmptyReason, filterImageLoadedOnce, filterImageLoading, masterImage, masterImageError, masterImageLoading, uploadSyncing]
  )

  useEffect(() => {
    activeSourceImageIdRef.current = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  }, [sourceSnapshot])

  const activeSnapshotImageId = sourceSnapshot.status === "ready" ? sourceSnapshot.image.id : null
  const imageStateEnabled = sourceSnapshot.status === "ready"
  const { initialImageTransform, imageStateLoading, loadImageState, saveImageState } = useImageState(
    projectId,
    imageStateEnabled,
    initialImageState,
    false,
    activeSnapshotImageId ?? undefined
  )
  const loadedStateImageIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeSnapshotImageId) {
      loadedStateImageIdRef.current = null
      return
    }
    if (loadedStateImageIdRef.current === activeSnapshotImageId) return
    loadedStateImageIdRef.current = activeSnapshotImageId
    void loadImageState()
  }, [activeSnapshotImageId, loadImageState])

  const refreshEditorDataOnce = useCallback(async () => {
    await refreshMasterImage()
    await refreshProjectImages()
    await refreshFilterImage()
    if (activeSnapshotImageId) {
      await loadImageState()
    }
  }, [activeSnapshotImageId, loadImageState, refreshFilterImage, refreshMasterImage, refreshProjectImages])

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
    async (op: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) => {
      const sourceImageId = activeSourceImageIdRef.current
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
    async ({ imageId, transform }: { imageId: string; transform: { xPxU?: bigint; yPxU?: bigint; widthPxU: bigint; heightPxU: bigint; rotationDeg: number } }) => {
      await saveImageState({ ...transform, imageId })
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
    async (op: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) => {
      await workflow.applyFilter(op)
    },
    [workflow]
  )
  const handleImageUploaded = useCallback(async () => {
    setUploadSyncing(true)
    try {
      await workflow.refreshAndWait()
    } finally {
      setUploadSyncing(false)
    }
  }, [workflow])

  const filterOperationError =
    workflow.lastOperation === "filter_apply" || workflow.lastOperation === "filter_remove" ? workflow.operationError : ""
  const restoreOperationError = workflow.lastOperation === "restore" ? workflow.operationError : ""
  const workflowFilterPanelError = filterOperationError || workflow.persistenceError || filterImageError

  return {
    sourceSnapshot,
    initialImageTransform,
    imageStateLoading,
    workflow,
    editorImageSource,
    activeCanvasImageId,
    filterSourceImage,
    handleApplyFilter,
    handleImageUploaded,
    filterOperationError,
    restoreOperationError,
    workflowFilterPanelError,
  }
}
