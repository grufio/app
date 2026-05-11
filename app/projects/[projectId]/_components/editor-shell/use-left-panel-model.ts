"use client"

import { useCallback, useMemo } from "react"

import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"

export function useLeftPanelModel(args: {
  selectedNavId: string
  setSelectedNavId: (next: string) => void
  projectImages: Array<{ id: string; name?: string | null }>
  setDeleteError: (v: string) => void
  setDeleteOpen: (v: boolean) => void
  createGrid: () => Promise<unknown | null>
  deleteGrid: () => Promise<boolean>
}) {
  const { selectedNavId, setSelectedNavId, projectImages, setDeleteError, setDeleteOpen, createGrid, deleteGrid } = args

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

  return {
    selectedImageId,
    leftPanelImages,
    requestDeleteImage,
    requestDeleteSelectedImage,
    requestCreateGrid,
    requestDeleteGrid,
  }
}
