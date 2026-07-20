import type { OperationError } from "@/lib/api/operation-error"
import type { ProjectImageItem } from "@/lib/api/project-images"
import type { FilterReadModel, FilterReadModelData } from "@/lib/editor/filter-working-image"
import type { MasterImage } from "@/lib/editor/master-image"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

export type WorkflowSourceImage = {
  id: string
  signedUrl: string
  width_px: number
  height_px: number
  name: string
}

export type WorkflowSourceStatus = "loading" | "ready" | "empty" | "error"

export type WorkflowSourceSnapshot = {
  status: WorkflowSourceStatus
  image: WorkflowSourceImage | null
  error: string
}

export type WorkflowTransformPayload = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU: bigint
  heightPxU: bigint
  rotationDeg: number
}

export type ImageWorkflowServices = {
  applyFilter: (args: { filterType: RegisteredFilterId; filterParams: Record<string, unknown> }) => Promise<void>
  removeFilter: (filterId: string) => Promise<void>
  applyCrop: (args: { sourceImageId: string; rect: { x: number; y: number; w: number; h: number } }) => Promise<void>
  restoreBase: () => Promise<void>
  /** Re-fetch the editor read-model slices after a mutation. Returns the
   * freshly-fetched master + filter (both owned by the machine); the machine's
   * `syncing.onDone` assigns them and re-derives the source snapshot. */
  refreshAll: () => Promise<{ master: MasterImage | null; filter: FilterReadModelData }>
  saveTransform: (args: { transform: WorkflowTransformPayload }) => Promise<void>
  /** Apply a trace: persist the current transform first (resize→apply race),
   * then run the trace. Mirrors `applyFilter` — the machine drives the refresh. */
  applyTrace: (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => Promise<void>
  /** Remove the applied trace. The machine's `syncing` refresh restores the
   * filter-chain tip; no master-image reload happens here. */
  clearTrace: () => Promise<void>
  /** Seed the freshly uploaded master (fast, synchronous UX); the machine's
   * `syncing` refresh then reconciles the derived slices. The actual file POST
   * runs in the uploader hook — only the post-upload seed+sync is machine-owned. */
  uploadMaster: (args: { master: UploadedMasterSnapshot }) => Promise<void>
  /** Delete the master (cascade) and seed the empty state; the machine's
   * `syncing` refresh reconciles. */
  deleteMaster: () => Promise<void>
}

export type ImageWorkflowContext = {
  services: ImageWorkflowServices
  source: WorkflowSourceSnapshot
  /** The project's master-image list (nav/selection). Owned by the machine
   * (read-model migration phase A); fed via `PROJECT_IMAGES_LOADED`. */
  projectImages: ProjectImageItem[]
  /** The master image (read-model migration phase B). Owned by the machine;
   * SSR-seeded via input, refreshed by `refreshAll`, seeded on upload/delete. */
  master: MasterImage | null
  masterLoading: boolean
  masterError: string
  /** The filter working-image read-model (read-model migration phase C).
   * Owned by the machine; `source` is derived internally from `master` +
   * `filter` (no more `SOURCE_SNAPSHOT` mirror event). */
  filter: FilterReadModel
  lastOperation:
    | "filter_apply"
    | "filter_remove"
    | "crop_apply"
    | "restore"
    | "refresh"
    | "trace_apply"
    | "trace_remove"
    | "image_upload"
    | "image_delete"
    | null
  lastOpError: OperationError | null
  lastPersistenceError: OperationError | null
  inFlightTransform: WorkflowTransformPayload | null
  pendingTransform: WorkflowTransformPayload | null
}

export type ImageWorkflowEvent =
  | { type: "SERVICES_UPDATE"; services: ImageWorkflowServices }
  | { type: "BOOT" }
  | { type: "REFRESH" }
  | { type: "PROJECT_IMAGES_LOADED"; items: ProjectImageItem[] }
  | { type: "MASTER_LOADED"; master: MasterImage | null; loading?: boolean; error?: string }
  /** Filter read-model update (phase C). Carries a partial patch merged into
   * `context.filter`; the loader sends `{ loading: true }` to start a fetch and
   * the mapped data (+ `loading: false`, `loadedOnce: true`) on completion. */
  | { type: "FILTER_LOADED"; patch: Partial<FilterReadModel> }
  /** Internal: re-derive `context.source` from the master + filter slices.
   * Raised after any slice change (never sent from React). */
  | { type: "SOURCE_RECOMPUTE" }
  | { type: "FILTER_APPLY"; filterType: RegisteredFilterId; filterParams: Record<string, unknown> }
  | { type: "FILTER_REMOVE"; filterId: string }
  | { type: "TRACE_APPLY"; kind: RegisteredTraceId; params: Record<string, unknown> }
  | { type: "TRACE_REMOVE" }
  | { type: "IMAGE_UPLOAD"; master: UploadedMasterSnapshot }
  | { type: "IMAGE_DELETE" }
  | { type: "CROP_APPLY"; rect: { x: number; y: number; w: number; h: number } }
  | { type: "RESTORE" }
  | { type: "TRANSFORM_SAVE"; transform: WorkflowTransformPayload }
  | { type: "RETRY" }
  | { type: "DISMISS_ERROR" }

