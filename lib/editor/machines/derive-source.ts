import type { FilterReadModel } from "@/lib/editor/filter-working-image"
import type { MasterImage } from "@/lib/editor/master-image"

import type { WorkflowSourceSnapshot } from "./image-workflow.types"

/**
 * Derive the canvas source snapshot from the machine-owned master + filter
 * slices (read-model phase C). This logic used to live in the adapter's
 * `deriveEditorSourceSnapshot`; it now runs inside the machine so `source` is
 * a pure function of context — no `SOURCE_SNAPSHOT` mirror event.
 *
 * Priority mirrors the old derivation exactly: loading → the trace-free filter
 * tip (ready) → filter error → master error → empty (active image resolved but
 * no working image) → unresolved-target error → empty.
 */
export function deriveSource(input: {
  master: MasterImage | null
  masterLoading: boolean
  masterError: string
  filter: FilterReadModel
}): WorkflowSourceSnapshot {
  const { master, masterLoading, masterError, filter } = input
  if (masterLoading || filter.loading || !filter.loadedOnce) {
    return { status: "loading", image: null, error: "" }
  }
  if (filter.imageWithoutTrace) {
    return {
      status: "ready",
      image: {
        id: filter.imageWithoutTrace.id,
        signedUrl: filter.imageWithoutTrace.signedUrl,
        width_px: filter.imageWithoutTrace.width_px,
        height_px: filter.imageWithoutTrace.height_px,
        name: filter.imageWithoutTrace.name,
      },
      error: "",
    }
  }
  if (filter.error) return { status: "error", image: null, error: filter.error }
  if (masterError) return { status: "error", image: null, error: masterError }
  if (master && filter.emptyReason === "no_active_image") {
    return { status: "empty", image: null, error: "" }
  }
  if (master) {
    return { status: "error", image: null, error: "Working image target is unresolved. Refresh editor state." }
  }
  return { status: "empty", image: null, error: "" }
}
