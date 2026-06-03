"use client"

/**
 * Shell-scope handler for the "delete master image" cascade.
 *
 * `delete_master_with_cascade` is an atomic DB write: on success every
 * `project_images` row (master + filter / trace / working_copy
 * derivatives) is gone. The post-success client state is therefore
 * trivial — null master, empty list — and seeding it directly skips
 * the 20s workflow timeout the explicit refresh would otherwise
 * require.
 *
 * The authoritative display source (`useDisplaySize`) is keyed on the
 * stable `masterRowId`; `seedMasterImage(null)` flips that to null,
 * the hook's master-transition effect fires and clears `displayTxU` to
 * null (master delete = no working copy, no state). No imperative
 * cleanup needed here.
 *
 * The background refresh is idempotent: empty is the stable fixed
 * point of the cascade, so an eventual confirm just re-confirms the
 * seeded state.
 */
import { useCallback } from "react"

import { deleteMasterImageWithCascade, type ProjectImageItem } from "@/lib/api/project-images"
import type { MasterImage } from "@/lib/editor/hooks/use-master-image"

type WorkflowSlice = {
  dismissError: () => void
}

export type UseDeleteMasterImageHandlerInput = {
  masterImageId: string | undefined
  projectId: string
  refreshFilterImage: () => Promise<unknown> | unknown
  refreshProjectImages: () => Promise<unknown> | unknown
  seedMasterImage: (next: MasterImage | null) => void
  seedProjectImages: (items: ProjectImageItem[]) => void
  setDeleteError: (message: string) => void
  setDeleteOpen: (open: boolean) => void
  workflow: WorkflowSlice
}

export function useDeleteMasterImageHandler(input: UseDeleteMasterImageHandlerInput) {
  const {
    masterImageId,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
    seedMasterImage,
    seedProjectImages,
    setDeleteError,
    setDeleteOpen,
    workflow,
  } = input

  return useCallback(async () => {
    if (!masterImageId) {
      setDeleteError("No master image to delete.")
      return
    }
    try {
      await deleteMasterImageWithCascade(projectId)
      setDeleteOpen(false)
      workflow.dismissError()
      seedMasterImage(null)
      seedProjectImages([])
      void Promise.allSettled([refreshProjectImages(), refreshFilterImage()])
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete image")
    }
  }, [
    masterImageId,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
    seedMasterImage,
    seedProjectImages,
    setDeleteError,
    setDeleteOpen,
    workflow,
  ])
}
