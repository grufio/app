export type FailStage =
  | "active_lookup"
  | "no_active_image"
  | "working_copy_exists"
  | "filter_rows_query"
  | "filter_output_query"
  | "filter_output_missing"
  | "filter_tip_missing"
  | "storage_download"
  | "storage_upload"
  | "db_insert"
  | "soft_delete"
  | "transform_sync"
  | "chain_invalid"

export type Failure = {
  ok: false
  status: number
  stage: FailStage
  reason: string
  code?: string
}

export type Success = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  signedUrl: string
  sourceImageId: string | null
  name: string
}

export type FilterWorkingCopyResult = Success | Failure

export type FilterPanelStackItem = {
  id: string
  name: string
  filterType: "pixelate" | "lineart" | "numerate" | "unknown"
  source_image_id: string | null
  is_hidden: boolean
}

export type FilterPanelDisplay = {
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  signedUrl: string
  sourceImageId: string | null
  name: string
  isFilterResult: boolean
}

export type FilterPanelDataResult =
  | {
      ok: true
      /** What the canvas should render by default: trace-aware. If a
       * project_image_trace row exists, this is the trace SVG; else
       * the filter chain tip (or working copy when no filters). */
      display: FilterPanelDisplay
      /** Same shape as `display` but without the trace override —
       * always the filter chain tip (or working copy). Used by the
       * Filter tab to show the raster filter result even when a
       * Trace artefact exists. */
      displayWithoutTrace: FilterPanelDisplay
      stack: FilterPanelStackItem[]
    }
  | Failure
