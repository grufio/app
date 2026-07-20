/**
 * Filter working-image value types + a pure mapper, shared by the
 * image-workflow machine (which now owns the filter read-model) and the
 * adapter loader. Extracted from the former `use-filter-working-image` hook
 * (read-model migration phase C).
 *
 * `getOrCreateFilterWorkingCopy` is side-effecting (it creates the working
 * copy on read); the machine now owns that single-flight fetch.
 */

import type { getOrCreateFilterWorkingCopy } from "@/lib/api/project-images"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"

export type FilterDisplayImage = {
  id: string
  signedUrl: string
  width_px: number
  height_px: number
  storage_path: string
  source_image_id: string | null
  name: string
  isFilterResult: boolean
}

export type FilterStackItem = {
  id: string
  name: string
  filterType: RegisteredFilterId | "unknown"
  source_image_id: string | null
}

/** The filter read-model slice owned by the image-workflow machine. Mirrors
 * the state the old `useFilterWorkingImage` hook exposed. */
export type FilterReadModel = {
  /** Trace-aware display tip (used for the canvas overlay path). */
  image: FilterDisplayImage | null
  /** Trace-free filter chain tip — the raster source used by the Filter tab
   * and as the filter-apply source (filters consume bitmaps, not trace SVGs). */
  imageWithoutTrace: FilterDisplayImage | null
  stack: FilterStackItem[]
  loading: boolean
  error: string
  emptyReason: "no_active_image" | null
  loadedOnce: boolean
}

export const initialFilterReadModel: FilterReadModel = {
  image: null,
  imageWithoutTrace: null,
  stack: [],
  loading: true,
  error: "",
  emptyReason: null,
  loadedOnce: false,
}

type WorkingCopyResult = Awaited<ReturnType<typeof getOrCreateFilterWorkingCopy>>

/** The "data" fields of a loaded filter slice — everything except the
 * lifecycle flags (`loading`/`loadedOnce`), which the loader owns. */
export type FilterReadModelData = Pick<
  FilterReadModel,
  "image" | "imageWithoutTrace" | "stack" | "emptyReason" | "error"
>

/**
 * Map a `getOrCreateFilterWorkingCopy` result to the loaded slice data.
 * Mirrors the branch logic the old hook ran inline: empty (with/without an
 * active image) vs. a resolved working copy + trace-free tip + stack.
 */
export function toFilterReadModelData(workingCopy: WorkingCopyResult): FilterReadModelData {
  if (!workingCopy.exists) {
    if (workingCopy.stage === "no_active_image") {
      return { image: null, imageWithoutTrace: null, stack: [], emptyReason: "no_active_image", error: "" }
    }
    return {
      image: null,
      imageWithoutTrace: null,
      stack: [],
      emptyReason: null,
      error: "Failed to resolve working image target",
    }
  }
  return {
    image: {
      id: workingCopy.id,
      signedUrl: workingCopy.signedUrl,
      width_px: workingCopy.width_px,
      height_px: workingCopy.height_px,
      storage_path: workingCopy.storage_path,
      source_image_id: workingCopy.source_image_id,
      name: workingCopy.name,
      isFilterResult: workingCopy.isFilterResult,
    },
    imageWithoutTrace: {
      id: workingCopy.withoutTrace.id,
      signedUrl: workingCopy.withoutTrace.signedUrl,
      width_px: workingCopy.withoutTrace.width_px,
      height_px: workingCopy.withoutTrace.height_px,
      storage_path: workingCopy.withoutTrace.storage_path,
      source_image_id: workingCopy.withoutTrace.source_image_id,
      name: workingCopy.withoutTrace.name,
      isFilterResult: workingCopy.withoutTrace.isFilterResult,
    },
    stack: workingCopy.stack,
    emptyReason: null,
    error: "",
  }
}
