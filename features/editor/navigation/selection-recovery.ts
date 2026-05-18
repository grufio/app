import { buildNavId, isImageNavSelection, parseNavId } from "./nav-id"

/**
 * Recover a stale image selection. The image node in the editor's nav
 * tree represents the project's master image; the only legitimate
 * `image:X` selection is `image:<masterImageId>`. Anything else is
 * stale (the master was replaced or deleted) and gets recovered to
 * either the current master or the artboard.
 */
export function recoverSelectedNavId(args: {
  selectedNavId: string
  masterImageId: string | null
}): string {
  const { selectedNavId, masterImageId } = args
  const selected = parseNavId(selectedNavId)
  if (!isImageNavSelection(selected)) return selectedNavId

  if (masterImageId && selected.imageId === masterImageId) {
    return selectedNavId
  }

  if (masterImageId) {
    return buildNavId({ kind: "image", imageId: masterImageId })
  }

  return buildNavId({ kind: "artboard" })
}
