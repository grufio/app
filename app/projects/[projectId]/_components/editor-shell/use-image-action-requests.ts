"use client"

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react"

import { buildNavId } from "@/features/editor/navigation/nav-id"
import { recoverSelectedNavId } from "@/features/editor/navigation/selection-recovery"

/**
 * Shell-scope image/grid action requests + selection bookkeeping.
 *
 * What survives the side-panel removal: the artboard sheet's Delete
 * action (`requestDeleteSelectedImage`), the grid Delete reset
 * (`requestDeleteGrid`), the keyboard-delete path, and the
 * auto-select-master / stale-selection-recovery effect that keeps
 * `selectedNavId` valid (the crop tool reads it — see
 * `use-stage-interaction-policy.ts`).
 *
 * Dropped with the nav tree: `leftPanelImages`, `selectedImageId`,
 * `requestDeleteImage` (by-id, nav-tree only) and `requestCreateGrid`
 * (nav-tree `+` row; grid creation now goes straight through
 * `createGrid` in the artboard sheet).
 */
export function useImageActionRequests(args: {
  setSelectedNavId: Dispatch<SetStateAction<string>>
  projectImages: Array<{ id: string; name?: string | null }>
  /** The current master image's id (null while SSR has no image yet
   * or after the master is deleted). Drives the auto-select effect. */
  masterImageId: string | null
  setDeleteError: (v: string) => void
  setDeleteOpen: (v: boolean) => void
  deleteGrid: () => Promise<boolean>
}) {
  const {
    setSelectedNavId,
    projectImages,
    masterImageId,
    setDeleteError,
    setDeleteOpen,
    deleteGrid,
  } = args

  const firstImageNavId = useMemo(
    () =>
      projectImages.length > 0
        ? buildNavId({ kind: "image", imageId: projectImages[0].id })
        : buildNavId({ kind: "artboard" }),
    [projectImages]
  )

  const requestDeleteSelectedImage = useCallback(() => {
    setDeleteError("")
    setDeleteOpen(true)
  }, [setDeleteError, setDeleteOpen])

  const requestDeleteGrid = useCallback(async () => {
    const ok = await deleteGrid()
    if (!ok) return
    setSelectedNavId(firstImageNavId)
  }, [deleteGrid, firstImageNavId, setSelectedNavId])

  // Auto-select-master + stale-selection-recovery effect.
  //
  // Two responsibilities, fused because they both react to the same
  // `(masterImageId, projectImages)` change:
  //
  // 1. When the master image first appears (`masterImageId` flips
  //    null → set) AND the user is still parked on the artboard, jump
  //    the selection to the new master. The `autoSelectMasterIdRef`
  //    fires this once per distinct master id.
  //
  // 2. Validate the current selection against the available images
  //    via `recoverSelectedNavId` (drops dangling image ids after a
  //    delete, falls back to artboard).
  const autoSelectMasterIdRef = useRef<string | null>(null)
  useEffect(() => {
    setSelectedNavId((prev) => {
      let next = prev
      if (!masterImageId) {
        autoSelectMasterIdRef.current = null
      } else if (autoSelectMasterIdRef.current !== masterImageId) {
        autoSelectMasterIdRef.current = masterImageId
        const artboardId = buildNavId({ kind: "artboard" })
        if (next === artboardId) {
          next = buildNavId({ kind: "image", imageId: masterImageId })
        }
      }
      return recoverSelectedNavId({
        selectedNavId: next,
        masterImageId,
      })
    })
  }, [masterImageId, projectImages, setSelectedNavId])

  return {
    requestDeleteSelectedImage,
    requestDeleteGrid,
  }
}
