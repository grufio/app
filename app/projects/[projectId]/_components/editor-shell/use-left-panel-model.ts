"use client"

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react"

import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"
import { recoverSelectedNavId } from "@/features/editor/navigation/selection-recovery"

export function useLeftPanelModel(args: {
  selectedNavId: string
  setSelectedNavId: Dispatch<SetStateAction<string>>
  projectImages: Array<{ id: string; name?: string | null }>
  /** The current master image's id (null while SSR has no image yet
   * or after the master is deleted). Drives the auto-select effect
   * below — when a master appears for the first time and the user is
   * still on the artboard, jump the selection to the new master. */
  masterImageId: string | null
  setDeleteError: (v: string) => void
  setDeleteOpen: (v: boolean) => void
  createGrid: () => Promise<unknown | null>
  deleteGrid: () => Promise<boolean>
}) {
  const {
    selectedNavId,
    setSelectedNavId,
    projectImages,
    masterImageId,
    setDeleteError,
    setDeleteOpen,
    createGrid,
    deleteGrid,
  } = args

  const selectedImageId = useMemo(() => {
    const selection = parseNavId(selectedNavId)
    if (selection.kind !== "image") return null
    return selection.imageId
  }, [selectedNavId])

  const leftPanelImages = useMemo(
    () =>
      projectImages.map((img) => ({
        id: img.id,
        label: img.name ?? "Image",
      })),
    [projectImages]
  )

  const firstImageNavId = useMemo(
    () =>
      projectImages.length > 0 ? buildNavId({ kind: "image", imageId: projectImages[0].id }) : buildNavId({ kind: "artboard" }),
    [projectImages]
  )

  const requestDeleteImage = useCallback(
    async (imageId: string) => {
      setDeleteError("")
      setSelectedNavId(buildNavId({ kind: "image", imageId }))
      setDeleteOpen(true)
    },
    [setDeleteError, setDeleteOpen, setSelectedNavId]
  )

  const requestDeleteSelectedImage = useCallback(() => {
    setDeleteError("")
    setDeleteOpen(true)
  }, [setDeleteError, setDeleteOpen])

  const requestCreateGrid = useCallback(async () => {
    const out = await createGrid()
    if (!out) return
    setSelectedNavId(buildNavId({ kind: "grid" }))
  }, [createGrid, setSelectedNavId])

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
  //    the selection to the new master so the right panel shows
  //    image-tx controls immediately. The `autoSelectMasterIdRef`
  //    fires this once per distinct master id — re-selecting the
  //    artboard manually after that does not re-trigger.
  //
  // 2. Validate the current selection against the available images
  //    via `recoverSelectedNavId` (drops dangling image ids after a
  //    delete, falls back to artboard).
  //
  // Lives here, not in the shell, because every input is already a
  // hook param (`projectImages`, `setSelectedNavId`) — the shell was
  // just plumbing the ref through.
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
        images: projectImages,
        activeMasterImageId: masterImageId,
      })
    })
  }, [masterImageId, projectImages, setSelectedNavId])

  return {
    selectedImageId,
    leftPanelImages,
    requestDeleteImage,
    requestDeleteSelectedImage,
    requestCreateGrid,
    requestDeleteGrid,
  }
}
