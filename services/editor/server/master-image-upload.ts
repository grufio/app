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
import { activateMasterWithState } from "@/lib/supabase/project-images"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

import { insertMasterWithCleanup } from "./master-image-upload/master-insert-flow"
import { validateUploadInputs, validateUploadLimits } from "./master-image-upload/policy"
import type { UploadMasterImageResult } from "./master-image-upload/types"
import { normalizePositiveInt } from "./master-image-upload/validation"

export type { UploadMasterImageFailure, UploadMasterImageSuccess, UploadMasterImageResult } from "./master-image-upload/types"

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
  const uploadResult = await supabase.storage.from("project_images").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  const uploadErr = (uploadResult as { error?: { message?: string; code?: string } } | null | undefined)?.error
  if (uploadErr) return { ok: false, reason: uploadErr.message, code: (uploadErr as unknown as { code?: string })?.code }

  const { error: insertErr } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    role: "asset",
    kind: "working_copy",
    name: `${file.name} (working copy)`,
    format,
    width_px: widthPx,
    height_px: heightPx,
    dpi,
    bit_depth: bitDepth,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: file.size,
    is_active: false,
    source_image_id: sourceMasterId,
  })
  if (insertErr) {
    await supabase.storage.from("project_images").remove([objectPath])
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
  dpi?: number
  bitDepth: number
  format: string
}): Promise<UploadMasterImageResult> {
  const { supabase, projectId, file, format } = args

  const widthPx = normalizePositiveInt(args.widthPx)
  const heightPx = normalizePositiveInt(args.heightPx)
  const dpi = normalizePositiveInt(args.dpi ?? Number.NaN)
  const bitDepth = normalizePositiveInt(args.bitDepth)

  const inputError = validateUploadInputs({ widthPx, heightPx, dpi, bitDepth })
  if (inputError) return inputError

  const limitError = validateUploadLimits({ file, widthPx, heightPx })
  if (limitError) return limitError

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`

  const { error: uploadErr } = await supabase.storage.from("project_images").upload(objectPath, file, {
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
    dpiX: dpi as number,
    dpiY: dpi as number,
    imageDpi: dpi as number,
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

  const working = await createWorkingCopyFromMaster({
    supabase,
    projectId,
    file,
    format,
    widthPx,
    heightPx,
    dpi: dpi as number,
    bitDepth,
    sourceMasterId: imageId,
  })
  if (!working.ok) {
    await supabase.from("project_images").delete().eq("id", imageId).eq("project_id", projectId)
    await supabase.storage.from("project_images").remove([objectPath])
    return {
      ok: false,
      status: 400,
      stage: "db_upsert",
      reason: working.reason,
      code: working.code,
    }
  }

  const activationResult = await activateMasterWithState({
    supabase,
    projectId,
    imageId,
    widthPx,
    heightPx,
    imageDpi: dpi as number,
  })
  if (!activationResult.ok) {
    await supabase.from("project_images").delete().eq("id", working.imageId).eq("project_id", projectId)
    await supabase.storage.from("project_images").remove([working.objectPath])
    await supabase.from("project_images").delete().eq("id", imageId).eq("project_id", projectId)
    await supabase.storage.from("project_images").remove([objectPath])
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
  })
  if (!transformCopy.ok) {
    await supabase.from("project_images").delete().eq("id", working.imageId).eq("project_id", projectId)
    await supabase.storage.from("project_images").remove([working.objectPath])
    await supabase.from("project_images").delete().eq("id", imageId).eq("project_id", projectId)
    await supabase.storage.from("project_images").remove([objectPath])
    return {
      ok: false,
      status: 500,
      stage: "db_upsert",
      reason: transformCopy.reason,
    }
  }

  return { ok: true, id: imageId, storagePath: objectPath }
}
