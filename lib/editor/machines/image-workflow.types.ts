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
  applyFilter: (args: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) => Promise<void>
  removeFilter: (filterId: string) => Promise<void>
  applyCrop: (args: { sourceImageId: string; rect: { x: number; y: number; w: number; h: number } }) => Promise<void>
  restoreBase: () => Promise<void>
  refreshAll: () => Promise<void>
  saveTransform: (args: { imageId: string; transform: WorkflowTransformPayload }) => Promise<void>
}

export type ImageWorkflowContext = {
  services: ImageWorkflowServices
  source: WorkflowSourceSnapshot
  lastOperation: "filter_apply" | "filter_remove" | "crop_apply" | "restore" | "refresh" | null
  lastOpError: string
  lastPersistenceError: string
  inFlightTransform: WorkflowTransformPayload | null
  pendingTransform: WorkflowTransformPayload | null
}

export type ImageWorkflowEvent =
  | { type: "SERVICES_UPDATE"; services: ImageWorkflowServices }
  | { type: "BOOT" }
  | { type: "REFRESH" }
  | { type: "SOURCE_SNAPSHOT"; snapshot: WorkflowSourceSnapshot }
  | { type: "FILTER_APPLY"; filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }
  | { type: "FILTER_REMOVE"; filterId: string }
  | { type: "CROP_APPLY"; rect: { x: number; y: number; w: number; h: number } }
  | { type: "RESTORE" }
  | { type: "TRANSFORM_SAVE"; transform: WorkflowTransformPayload }
  | { type: "RETRY" }
  | { type: "DISMISS_ERROR" }

