export type UploadFailStage =
  | "validation"
  | "upload_limits"
  | "storage_upload"
  | "db_upsert"
  | "active_switch"
  | "transform_sync"

export type UploadMasterImageFailure = {
  ok: false
  status: number
  stage: UploadFailStage
  reason: string
  code?: string
  details?: Record<string, unknown>
}

/**
 * Snapshot of the freshly-inserted master, fully signed and ready
 * to seed `useMasterImage` on the client without an extra GET.
 * Shape matches `MasterImageResponse` (exists=true variant) in
 * `lib/api/project-images.ts` so the client can reuse the same
 * `toMasterImage` parser.
 *
 * At upload time the master row IS the active row (no filter yet,
 * working_copy shares the same storage_path), so
 * `masterSignedUrl === signedUrl`. The field is still emitted
 * explicitly so the client snapshot type matches the GET payload
 * shape one-to-one.
 */
export type UploadMasterSnapshot = {
  id: string
  signedUrl: string
  masterSignedUrl: string
  storage_path: string
  name: string
  format: string | null
  width_px: number
  height_px: number
  dpi: number | null
  file_size_bytes: number | null
}

export type UploadMasterImageSuccess = {
  ok: true
  id: string
  storagePath: string
  master: UploadMasterSnapshot
}

export type UploadMasterImageResult = UploadMasterImageSuccess | UploadMasterImageFailure

export type ExistingMasterRow = {
  id: string
  storage_bucket: string | null
  storage_path: string | null
}
