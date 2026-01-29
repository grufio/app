/**
 * Layer selection persistence (localStorage).
 *
 * Responsibilities:
 * - Store/restore the selected layer id per project.
 * - Maintain backward compatibility keys during migrations.
 */
export type LayerSelectionKind = "artboard" | "image" | "filter"

function legacyKey(projectId: string) {
  return `gruf:editor:layers:selected:${projectId}`
}

function v1Key(projectId: string) {
  return `gruf:v1:editor:layers:selected:${projectId}`
}

export function readSelectedLayerId(projectId: string) {
  if (typeof window === "undefined") return "artboard"
  try {
    return (
      window.localStorage.getItem(v1Key(projectId)) ??
      window.localStorage.getItem(legacyKey(projectId)) ??
      "artboard"
    )
  } catch {
    return "artboard"
  }
}

export function writeSelectedLayerId(projectId: string, layerId: string) {
  if (typeof window === "undefined") return
  try {
    // Write both to keep backward compatibility with older builds while we migrate.
    window.localStorage.setItem(v1Key(projectId), layerId)
    window.localStorage.setItem(legacyKey(projectId), layerId)
  } catch {
    // ignore (private mode / denied)
  }
}

