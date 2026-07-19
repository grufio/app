import type { OperationError } from "@/lib/api/operation-error"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

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
  refreshAll: () => Promise<void>
  saveTransform: (args: { transform: WorkflowTransformPayload }) => Promise<void>
  /** Apply a trace: persist the current transform first (resize→apply race),
   * then run the trace. Mirrors `applyFilter` — the machine drives the refresh. */
  applyTrace: (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => Promise<void>
  /** Remove the applied trace. The machine's `syncing` refresh restores the
   * filter-chain tip; no master-image reload happens here. */
  clearTrace: () => Promise<void>
}

export type ImageWorkflowContext = {
  services: ImageWorkflowServices
  source: WorkflowSourceSnapshot
  lastOperation: "filter_apply" | "filter_remove" | "crop_apply" | "restore" | "refresh" | "trace_apply" | "trace_remove" | null
  lastOpError: OperationError | null
  lastPersistenceError: OperationError | null
  inFlightTransform: WorkflowTransformPayload | null
  pendingTransform: WorkflowTransformPayload | null
}

export type ImageWorkflowEvent =
  | { type: "SERVICES_UPDATE"; services: ImageWorkflowServices }
  | { type: "BOOT" }
  | { type: "REFRESH" }
  | { type: "SOURCE_SNAPSHOT"; snapshot: WorkflowSourceSnapshot }
  | { type: "FILTER_APPLY"; filterType: RegisteredFilterId; filterParams: Record<string, unknown> }
  | { type: "FILTER_REMOVE"; filterId: string }
  | { type: "TRACE_APPLY"; kind: RegisteredTraceId; params: Record<string, unknown> }
  | { type: "TRACE_REMOVE" }
  | { type: "CROP_APPLY"; rect: { x: number; y: number; w: number; h: number } }
  | { type: "RESTORE" }
  | { type: "TRANSFORM_SAVE"; transform: WorkflowTransformPayload }
  | { type: "RETRY" }
  | { type: "DISMISS_ERROR" }

