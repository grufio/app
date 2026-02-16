import { buildNavId, isImageNavSelection, parseNavId } from "./nav-id"

type ImageLike = { id: string }

/**
 * Recover stale image selection after list updates (delete/refresh).
 */
export function recoverSelectedNavId(args: {
  selectedNavId: string
  images: ImageLike[]
  activeMasterImageId?: string | null
}): string {
  const { selectedNavId, images, activeMasterImageId } = args
  const selected = parseNavId(selectedNavId)
  if (!isImageNavSelection(selected)) return selectedNavId

  const selectedStillExists = images.some((img) => img.id === selected.imageId)
  if (selectedStillExists) return selectedNavId

  if (activeMasterImageId && images.some((img) => img.id === activeMasterImageId)) {
    return buildNavId({ kind: "image", imageId: activeMasterImageId })
  }

  return buildNavId({ kind: "artboard" })
}
