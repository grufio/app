/**
 * Layer selection persistence (localStorage).
 *
 * Responsibilities:
 * - Store/restore the selected layer id per project.
 */
export type LayerSelectionKind = "artboard" | "image" | "filter"

function storageKey(projectId: string) {
  return `gruf:v1:editor:layers:selected:${projectId}`
}

export function readSelectedLayerId(projectId: string) {
  if (typeof window === "undefined") return "artboard"
  try {
    return window.localStorage.getItem(storageKey(projectId)) ?? "artboard"
  } catch {
    return "artboard"
  }
}

export function writeSelectedLayerId(projectId: string, layerId: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(projectId), layerId)
  } catch {
    // ignore (private mode / denied)
  }
}
