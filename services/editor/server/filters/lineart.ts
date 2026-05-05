import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8001"

type LineArtFailStage =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | "lineart_process"
  | "storage_upload"
  | "db_insert"
  | "transform_sync"
  | "active_switch"

type LineArtFailure = {
  ok: false
  status: number
  stage: LineArtFailStage
  reason: string
  code?: string
}

type LineArtSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
}

export type LineArtFilterResult = LineArtSuccess | LineArtFailure

type LineArtParams = {
  threshold1: number
  threshold2: number
  lineThickness: number
  invert: boolean
  blurAmount: number
  minContourArea: number
  smoothness: number
}

function toInt(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const n = Math.round(value)
  if (n < 0) return null
  return n
}

export async function lineArtImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: LineArtParams
}): Promise<LineArtFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const threshold1 = toInt(params.threshold1)
  const threshold2 = toInt(params.threshold2)
  const blurAmount = toInt(params.blurAmount)
  const minContourArea = toInt(params.minContourArea)
  const lineThickness = toInt(params.lineThickness)
  const smoothness = params.smoothness

  if (
    threshold1 == null ||
    threshold2 == null ||
    threshold1 < 0 ||
    threshold2 < 0 ||
    threshold1 >= threshold2 ||
    blurAmount == null ||
    blurAmount < 0 ||
    blurAmount > 20 ||
    minContourArea == null ||
    minContourArea < 0 ||
    lineThickness == null ||
    lineThickness < 1 ||
    lineThickness > 10 ||
    !Number.isFinite(smoothness) ||
    smoothness < 0 ||
    smoothness > 0.1
  ) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid line art params" }
  }

  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,is_locked")
    .eq("id", sourceImageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()

  if (srcErr || !src) {
    return { ok: false, status: 404, stage: "source_lookup", reason: "Source image not found", code: srcErr?.code }
  }

  if (src.is_locked) {
    return { ok: false, status: 409, stage: "lock_conflict", reason: "Source image is locked" }
  }

  const origWidth = toInt(src.width_px)
  const origHeight = toInt(src.height_px)
  if (origWidth == null || origHeight == null || origWidth < 1 || origHeight < 1) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid source dimensions" }
  }

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? "project_images"))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())

  try {
    // Call Python service for line art
    const imageBase64 = srcBuffer.toString("base64")

    const response = await fetch(`${PYTHON_SERVICE_URL}/filters/lineart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        threshold1: threshold1,
        threshold2: threshold2,
        line_thickness: lineThickness,
        invert: params.invert,
        blur_amount: blurAmount,
        min_contour_area: minContourArea,
        smoothness: smoothness,
      }),
    })

    if (!response.ok) {
      let error = await response.text()
      try {
        const parsed = JSON.parse(error) as { detail?: unknown }
        if (typeof parsed.detail === "string" && parsed.detail.trim()) {
          error = parsed.detail
        }
      } catch {
        // Keep raw response text for non-JSON error payloads.
      }
      return {
        ok: false,
        status: response.status,
        stage: "lineart_process",
        reason: `Python service error: ${error}`,
      }
    }

    const outputBuffer = Buffer.from(await response.arrayBuffer())

    const imageId = crypto.randomUUID()
    const objectPath = `projects/${projectId}/images/${imageId}`

    const { error: uploadErr } = await supabase.storage
      .from("project_images")
      .upload(objectPath, outputBuffer, {
        contentType: "image/svg+xml",
        upsert: false,
      })

    if (uploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload line art image" }
    }

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "filter_working_copy",
      name: `${src.name.replace(/ \(filter working\)| \(pixelate\)| \(line art\)| \(numerate\)/g, "")} (line art)`,
      format: "svg",
      width_px: origWidth,
      height_px: origHeight,
      storage_bucket: "project_images",
      storage_path: objectPath,
      file_size_bytes: outputBuffer.byteLength,
      is_active: false,
      source_image_id: sourceImageId,
    })

    if (insertErr) {
      await supabase.storage.from("project_images").remove([objectPath])
      return { ok: false, status: 400, stage: "db_insert", reason: insertErr.message, code: insertErr.code }
    }

    // Copy transform from source to filter image
    const transformCopy = await copyImageTransform({
      supabase,
      projectId,
      sourceImageId,
      targetImageId: imageId,
      sourceWidth: origWidth,
      sourceHeight: origHeight,
      targetWidth: origWidth,
      targetHeight: origHeight,
    })
    if (!transformCopy.ok) {
      await supabase.from("project_images").delete().eq("id", imageId)
      await supabase.storage.from("project_images").remove([objectPath])
      return { ok: false, status: 500, stage: "transform_sync", reason: transformCopy.reason }
    }


    return {
      ok: true,
      id: imageId,
      storagePath: objectPath,
      widthPx: origWidth,
      heightPx: origHeight,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Line art process failed"
    return { ok: false, status: 500, stage: "lineart_process", reason: msg }
  }
}
