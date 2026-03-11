export type UploadFailStage = "validation" | "upload_limits" | "storage_upload" | "db_upsert" | "active_switch" | "lock_conflict"

export type UploadMasterImageFailure = {
  ok: false
  status: number
  stage: UploadFailStage
  reason: string
  code?: string
  details?: Record<string, unknown>
}

export type UploadMasterImageSuccess = {
  ok: true
  id: string
  storagePath: string
}

export type UploadMasterImageResult = UploadMasterImageSuccess | UploadMasterImageFailure

export type ExistingMasterRow = {
  id: string
  storage_bucket: string | null
  storage_path: string | null
}
