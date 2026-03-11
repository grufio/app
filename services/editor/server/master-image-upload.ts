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

import { activateInsertedMaster } from "./master-image-upload/activation"
import { insertMasterWithCleanup } from "./master-image-upload/master-insert-flow"
import { validateUploadInputs, validateUploadLimits } from "./master-image-upload/policy"
import type { UploadMasterImageResult } from "./master-image-upload/types"
import { normalizePositiveInt, resolveImageDpi } from "./master-image-upload/validation"

export type { UploadMasterImageFailure, UploadMasterImageSuccess, UploadMasterImageResult } from "./master-image-upload/types"

export async function uploadMasterImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  file: File
  widthPx: number
  heightPx: number
  dpiX: number
  dpiY: number
  bitDepth: number
  format: string
}): Promise<UploadMasterImageResult> {
  const { supabase, projectId, file, format } = args

  const widthPx = normalizePositiveInt(args.widthPx)
  const heightPx = normalizePositiveInt(args.heightPx)
  const dpiX = normalizePositiveInt(args.dpiX)
  const dpiY = normalizePositiveInt(args.dpiY)
  const bitDepth = normalizePositiveInt(args.bitDepth)
  const imageDpi = resolveImageDpi({ dpiX, dpiY })

  const inputError = validateUploadInputs({ widthPx, heightPx, dpiX, dpiY, bitDepth })
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
    dpiX,
    dpiY,
    imageDpi,
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

  const activationResult = await activateInsertedMaster({
    supabase,
    projectId,
    imageId,
    widthPx,
    heightPx,
    imageDpi,
    objectPath,
  })
  if (!activationResult.ok) {
    return {
      ok: false,
      status: activationResult.status,
      stage: activationResult.stage,
      reason: activationResult.reason,
      code: activationResult.code,
    }
  }

  return { ok: true, id: imageId, storagePath: objectPath }
}
