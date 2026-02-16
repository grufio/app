/**
 * Editor navigation ID helpers.
 *
 * Keeps nav-id parsing/building in one place so routing/selection logic
 * does not depend on ad-hoc string checks.
 */

export type NavSelection =
  | { kind: "artboard" }
  | { kind: "imagesFolder" }
  | { kind: "image"; imageId: string }

export const EDITOR_NAV_ARTBOARD_ID = "app"
export const EDITOR_NAV_IMAGES_FOLDER_ID = "app/api"

export function buildNavId(selection: NavSelection): string {
  if (selection.kind === "artboard") return EDITOR_NAV_ARTBOARD_ID
  if (selection.kind === "imagesFolder") return EDITOR_NAV_IMAGES_FOLDER_ID
  return `${EDITOR_NAV_IMAGES_FOLDER_ID}/${selection.imageId}`
}

export function parseNavId(id: string): NavSelection {
  if (id === EDITOR_NAV_IMAGES_FOLDER_ID) return { kind: "imagesFolder" }
  if (id.startsWith(`${EDITOR_NAV_IMAGES_FOLDER_ID}/`)) {
    const imageId = id.slice(`${EDITOR_NAV_IMAGES_FOLDER_ID}/`.length)
    if (imageId.length > 0) return { kind: "image", imageId }
    return { kind: "imagesFolder" }
  }
  return { kind: "artboard" }
}

export function isImageNavSelection(selection: NavSelection): selection is { kind: "image"; imageId: string } {
  return selection.kind === "image"
}
