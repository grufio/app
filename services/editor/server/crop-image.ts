import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import { copyImageTransform } from "@/services/editor/server/copy-image-transform"
import type { Database } from "@/lib/supabase/database.types"
import { activateMasterWithState } from "@/lib/supabase/project-images"

type CropFailStage =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | "crop_process"
  | "storage_upload"
  | "db_insert"
  | "active_switch"

type CropFailure = {
  ok: false
  status: number
  stage: CropFailStage
  reason: string
  code?: string
}

type CropSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
}

export type CropImageResult = CropSuccess | CropFailure

type CropRect = {
  x: number
  y: number
  w: number
  h: number
}

function toInt(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const n = Math.round(value)
  if (n < 0) return null
  return n
}

function pickOutputFormat(format: string | null | undefined): "jpeg" | "png" | "webp" {
  const f = String(format ?? "").toLowerCase()
  if (f === "jpg" || f === "jpeg") return "jpeg"
  if (f === "webp") return "webp"
  return "png"
}

function contentTypeFor(format: "jpeg" | "png" | "webp"): string {
  if (format === "jpeg") return "image/jpeg"
  if (format === "webp") return "image/webp"
  return "image/png"
}

export async function cropImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  rect: CropRect
}): Promise<CropImageResult> {
  const { supabase, projectId, sourceImageId, rect } = args
  const x = toInt(rect.x)
  const y = toInt(rect.y)
  const w = toInt(rect.w)
  const h = toInt(rect.h)
  if (x == null || y == null || w == null || h == null || w < 10 || h < 10) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid crop rect (int, min 10x10)" }
  }

  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,project_id,name,format,width_px,height_px,storage_bucket,storage_path,deleted_at,is_locked")
    .eq("project_id", projectId)
    .eq("id", sourceImageId)
    .is("deleted_at", null)
    .maybeSingle()

  if (srcErr) {
    return { ok: false, status: 400, stage: "source_lookup", reason: srcErr.message, code: (srcErr as { code?: string }).code }
  }
  if (!src?.storage_path) {
    return { ok: false, status: 404, stage: "source_lookup", reason: "Source image not found" }
  }
  if (src.is_locked) {
    return { ok: false, status: 409, stage: "lock_conflict", reason: "Source image is locked", code: "image_locked" }
  }

  if (x + w > src.width_px || y + h > src.height_px) {
    return { ok: false, status: 400, stage: "validation", reason: "Crop rect out of source bounds" }
  }

  const sourceBucket = src.storage_bucket ?? "project_images"
  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(sourceBucket))
    .download(String(src.storage_path))
  
  if (downloadErr || !srcBlob) {
    const errDetails = downloadErr ? JSON.stringify(downloadErr) : "No blob returned"
    return { 
      ok: false, 
      status: 400, 
      stage: "source_download", 
      reason: `Download failed: ${errDetails}. Path: ${src.storage_path}, Bucket: ${sourceBucket}` 
    }
  }

  let outputBuffer: Buffer
  let outputFormat: "jpeg" | "png" | "webp"
  try {
    outputFormat = pickOutputFormat(src.format)
    const sourceBuffer = Buffer.from(await srcBlob.arrayBuffer())
    const pipeline = sharp(sourceBuffer).extract({ left: x, top: y, width: w, height: h })
    outputBuffer = await pipeline.toFormat(outputFormat).toBuffer()
  } catch (err) {
    return {
      ok: false,
      status: 400,
      stage: "crop_process",
      reason: err instanceof Error ? err.message : "Crop processing failed",
    }
  }

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`
  const { error: uploadErr } = await supabase.storage.from("project_images").upload(objectPath, outputBuffer, {
    contentType: contentTypeFor(outputFormat),
    upsert: false,
  })
  if (uploadErr) {
    return { ok: false, status: 400, stage: "storage_upload", reason: uploadErr.message, code: (uploadErr as { code?: string }).code }
  }

  const { error: insertErr } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    role: "asset",
    name: `${src.name} (crop)`,
    format: outputFormat,
    width_px: w,
    height_px: h,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: outputBuffer.byteLength,
    is_active: false,
    source_image_id: sourceImageId,
    crop_rect_px: { x, y, w, h },
  })
  if (insertErr) {
    await supabase.storage.from("project_images").remove([objectPath])
    return { ok: false, status: 400, stage: "db_insert", reason: insertErr.message, code: (insertErr as { code?: string }).code }
  }
  // Copy transform from source to cropped image
  await copyImageTransform({
    supabase,
    projectId,
    sourceImageId,
    targetImageId: imageId,
    sourceWidth: origWidth,
    sourceHeight: origHeight,
    targetWidth: w,
    targetHeight: h,
  })


  const activation = await activateMasterWithState({
    supabase,
    projectId,
    imageId,
    widthPx: w,
    heightPx: h,
  })
  if (!activation.ok) {
    await supabase.from("project_images").delete().eq("id", imageId)
    await supabase.storage.from("project_images").remove([objectPath])
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  return { ok: true, id: imageId, storagePath: objectPath, widthPx: w, heightPx: h }
}
