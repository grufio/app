/**
 * Server-side orchestration for master image uploads.
 *
 * Responsibilities:
 * - Normalize upload metadata.
 * - Enforce upload policy and limits.
 * - Coordinate storage write, DB insert, and activation.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { activateProjectMasterAndWorkingCopy } from "@/services/editor/server/activate-project-image"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"

import { insertMasterWithCleanup } from "./master-image-upload/master-insert-flow"
import { validateUploadInputs, validateUploadLimits } from "./master-image-upload/policy"
import type { InsertedMasterRow } from "./master-image-upload/insert-master"
import type { UploadMasterImageResult, UploadMasterSnapshot } from "./master-image-upload/types"
import { normalizePositiveInt } from "./master-image-upload/validation"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export type { UploadMasterImageFailure, UploadMasterImageSuccess, UploadMasterImageResult, UploadMasterSnapshot } from "./master-image-upload/types"

const SNAPSHOT_SIGNED_URL_TTL_S = 60 * 30

async function buildMasterSnapshot(args: {
  supabase: SupabaseClient<Database>
  row: InsertedMasterRow
}): Promise<UploadMasterSnapshot | null> {
  const { supabase, row } = args
  if (!row.storage_path) return null
  const bucket = row.storage_bucket ?? PROJECT_IMAGES_BUCKET
  const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrl(row.storage_path, SNAPSHOT_SIGNED_URL_TTL_S)
  if (error || !signed?.signedUrl) return null
  return {
    id: row.id,
    signedUrl: signed.signedUrl,
    storage_path: row.storage_path,
    name: row.name ?? "master image",
    format: row.format ?? null,
    width_px: Number(row.width_px ?? 0),
    height_px: Number(row.height_px ?? 0),
    dpi: row.dpi == null ? null : Number(row.dpi),
    file_size_bytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
  }
}

async function rollbackCreatedUploadRows(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  masterImageId: string
  masterObjectPath: string
}) {
  const { supabase, projectId, masterImageId, masterObjectPath } = args
  await supabase.from("project_images").delete().eq("id", masterImageId).eq("project_id", projectId)
  await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([masterObjectPath])
}

export async function uploadMasterImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  file: File
  widthPx: number
  heightPx: number
  dpi?: number | null
  format: string
}): Promise<UploadMasterImageResult> {
  const { supabase, projectId, file, format } = args

  const validated = validateUploadInputs({
    widthPx: normalizePositiveInt(args.widthPx),
    heightPx: normalizePositiveInt(args.heightPx),
    dpi: normalizePositiveInt(args.dpi ?? Number.NaN),
  })
  if (!validated.ok) return validated
  const { widthPx, heightPx, dpi } = validated

  const limitError = validateUploadLimits({ file, widthPx, heightPx })
  if (limitError) return limitError

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`

  const { error: uploadErr } = await supabase.storage.from(PROJECT_IMAGES_BUCKET).upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (uploadErr) {
    return {
      ok: false,
      status: 400,
      stage: "storage_upload",
      reason: uploadErr.message,
      code: (uploadErr as unknown as { code?: string })?.code,
    }
  }

  const insertResult = await insertMasterWithCleanup({
    supabase,
    imageId,
    projectId,
    file,
    format,
    widthPx,
    heightPx,
    imageDpi: dpi,
    objectPath,
  })
  if (!insertResult.ok) {
    return {
      ok: false,
      status: 400,
      stage: "db_upsert",
      reason: insertResult.reason,
      code: insertResult.code,
    }
  }
  const insertedRow = insertResult.row

  const filterReset = await resetProjectFilterChain({ supabase, projectId })
  if (!filterReset.ok) {
    await rollbackCreatedUploadRows({
      supabase,
      projectId,
      masterImageId: imageId,
      masterObjectPath: objectPath,
    })
    return {
      ok: false,
      status: 500,
      stage: "db_upsert",
      reason: filterReset.reason,
      code: filterReset.code,
    }
  }

  // Eager working_copy: inserted immediately alongside the master so
  // the editor always has an editable surface. storage_path is shared
  // with master (= same file, no extra storage). Any destructive
  // bitmap operation in the future would copy-on-write, but resize/
  // drag/pixelate apply (post-refactor) don't mutate the bitmap.
  const workingCopyId = crypto.randomUUID()
  const workingCopyName = (insertedRow.name ?? "image") + " (working copy)"
  const { error: workingCopyErr } = await supabase
    .from("project_images")
    .insert({
      id: workingCopyId,
      project_id: projectId,
      kind: "working_copy",
      source_image_id: imageId,
      name: workingCopyName,
      format: insertedRow.format,
      width_px: insertedRow.width_px,
      height_px: insertedRow.height_px,
      dpi: insertedRow.dpi,
      storage_bucket: insertedRow.storage_bucket,
      storage_path: insertedRow.storage_path,
      file_size_bytes: insertedRow.file_size_bytes,
      is_active: false, // flipped to true by the activation RPC below
    })
  if (workingCopyErr) {
    await rollbackCreatedUploadRows({
      supabase,
      projectId,
      masterImageId: imageId,
      masterObjectPath: objectPath,
    })
    return {
      ok: false,
      status: 500,
      stage: "db_upsert",
      reason: `Failed to insert working_copy row: ${workingCopyErr.message}`,
      code: (workingCopyErr as unknown as { code?: string })?.code,
    }
  }

  const activationResult = await activateProjectMasterAndWorkingCopy({
    supabase,
    projectId,
    masterImageId: imageId,
    workingCopyImageId: workingCopyId,
    widthPx,
    heightPx,
    imageDpi: dpi,
  })
  if (!activationResult.ok) {
    await rollbackCreatedUploadRows({
      supabase,
      projectId,
      masterImageId: imageId,
      masterObjectPath: objectPath,
    })
    // Working-copy row is cascade-deleted via source_image_id FK when
    // master row is deleted above; no separate delete needed here.
    return {
      ok: false,
      status: activationResult.status,
      stage: activationResult.stage,
      reason: activationResult.reason,
      code: activationResult.code,
    }
  }

  // Sign the freshly-inserted row so the client can seed its
  // master-image hook without a follow-up GET. Activation flipped
  // is_active=true on insertedRow's PK, but the local copy still
  // reads is_active=false — that field isn't part of the snapshot
  // contract, so no re-fetch needed.
  const master = await buildMasterSnapshot({ supabase, row: insertedRow })
  if (!master) {
    return {
      ok: false,
      status: 500,
      stage: "db_upsert",
      reason: "Failed to sign uploaded master URL",
    }
  }
  return { ok: true, id: imageId, storagePath: objectPath, master }
}
