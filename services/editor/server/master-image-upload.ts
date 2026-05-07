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
import { activateProjectImage } from "@/services/editor/server/activate-project-image"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"

import { insertMasterWithCleanup } from "./master-image-upload/master-insert-flow"
import { validateUploadInputs, validateUploadLimits } from "./master-image-upload/policy"
import type { UploadMasterImageResult } from "./master-image-upload/types"
import { normalizePositiveInt } from "./master-image-upload/validation"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export type { UploadMasterImageFailure, UploadMasterImageSuccess, UploadMasterImageResult } from "./master-image-upload/types"

async function rollbackCreatedUploadRows(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  masterImageId: string
  masterObjectPath: string
  workingImageId?: string
  workingObjectPath?: string
}) {
  const { supabase, projectId, masterImageId, masterObjectPath, workingImageId, workingObjectPath } = args
  if (workingImageId) {
    await supabase.from("project_images").delete().eq("id", workingImageId).eq("project_id", projectId)
  }
  if (workingObjectPath) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([workingObjectPath])
  }
  await supabase.from("project_images").delete().eq("id", masterImageId).eq("project_id", projectId)
  await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([masterObjectPath])
}

async function createWorkingCopyFromMaster(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  file: File
  format: string
  widthPx: number
  heightPx: number
  dpi: number
  bitDepth: number
  sourceMasterId: string
}): Promise<{ ok: true; imageId: string; objectPath: string } | { ok: false; reason: string; code?: string }> {
  const { supabase, projectId, file, format, widthPx, heightPx, dpi, bitDepth, sourceMasterId } = args
  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`
  const uploadResult = await supabase.storage.from(PROJECT_IMAGES_BUCKET).upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  const uploadErr = (uploadResult as { error?: { message?: string; code?: string } } | null | undefined)?.error
  if (uploadErr) return { ok: false, reason: uploadErr.message ?? "Upload failed", code: (uploadErr as unknown as { code?: string })?.code }

  const { error: insertErr } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    kind: "working_copy",
    name: `${file.name} (working copy)`,
    format,
    width_px: widthPx,
    height_px: heightPx,
    dpi,
    bit_depth: bitDepth,
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: objectPath,
    file_size_bytes: file.size,
    is_active: false,
    source_image_id: sourceMasterId,
  })
  if (insertErr) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
    return { ok: false, reason: insertErr.message, code: (insertErr as unknown as { code?: string })?.code }
  }
  return { ok: true, imageId, objectPath }
}

export async function uploadMasterImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  file: File
  widthPx: number
  heightPx: number
  dpi?: number | null
  bitDepth?: number | null
  format: string
}): Promise<UploadMasterImageResult> {
  const { supabase, projectId, file, format } = args

  const validated = validateUploadInputs({
    widthPx: normalizePositiveInt(args.widthPx),
    heightPx: normalizePositiveInt(args.heightPx),
    dpi: normalizePositiveInt(args.dpi ?? Number.NaN),
    bitDepth: normalizePositiveInt(args.bitDepth ?? Number.NaN),
  })
  if (!validated.ok) return validated
  const { widthPx, heightPx, dpi, bitDepth } = validated

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
    dpiX: dpi,
    dpiY: dpi,
    imageDpi: dpi,
    bitDepth,
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

  const working = await createWorkingCopyFromMaster({
    supabase,
    projectId,
    file,
    format,
    widthPx,
    heightPx,
    dpi,
    bitDepth,
    sourceMasterId: imageId,
  })
  if (!working.ok) {
    await rollbackCreatedUploadRows({
      supabase,
      projectId,
      masterImageId: imageId,
      masterObjectPath: objectPath,
    })
    return {
      ok: false,
      status: 400,
      stage: "db_upsert",
      reason: working.reason,
      code: working.code,
    }
  }

  const activationResult = await activateProjectImage({
    supabase,
    projectId,
    imageId,
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
      workingImageId: working.imageId,
      workingObjectPath: working.objectPath,
    })
    return {
      ok: false,
      status: activationResult.status,
      stage: activationResult.stage,
      reason: activationResult.reason,
      code: activationResult.code,
    }
  }

  const transformCopy = await copyImageTransform({
    supabase,
    projectId,
    sourceImageId: imageId,
    targetImageId: working.imageId,
    sourceWidth: widthPx,
    sourceHeight: heightPx,
    targetWidth: widthPx,
    targetHeight: heightPx,
    fallbackWhenMissingSource: true,
  })
  if (!transformCopy.ok) {
    await rollbackCreatedUploadRows({
      supabase,
      projectId,
      masterImageId: imageId,
      masterObjectPath: objectPath,
      workingImageId: working.imageId,
      workingObjectPath: working.objectPath,
    })
    return {
      ok: false,
      status: 500,
      stage: "transform_sync",
      reason: transformCopy.reason,
    }
  }

  return { ok: true, id: imageId, storagePath: objectPath }
}
