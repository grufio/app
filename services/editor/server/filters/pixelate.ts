import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8001"

type PixelateFailStage =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | "pixelate_process"
  | "storage_upload"
  | "db_insert"
  | "active_switch"

type PixelateFailure = {
  ok: false
  status: number
  stage: PixelateFailStage
  reason: string
  code?: string
}

type PixelateSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
}

export type PixelateFilterResult = PixelateSuccess | PixelateFailure

type PixelateParams = {
  superpixelWidth: number
  superpixelHeight: number
  colorMode: "rgb" | "grayscale"
  numColors: number
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

export async function pixelateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: PixelateParams
}): Promise<PixelateFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const superpixelWidth = toInt(params.superpixelWidth)
  const superpixelHeight = toInt(params.superpixelHeight)
  const numColors = toInt(params.numColors)

  if (
    superpixelWidth == null ||
    superpixelHeight == null ||
    superpixelWidth < 1 ||
    superpixelHeight < 1 ||
    numColors == null ||
    numColors < 2 ||
    numColors > 256
  ) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid pixelate params" }
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

  // Calculate grid dimensions
  const gridWidth = Math.max(1, Math.floor(origWidth / superpixelWidth))
  const gridHeight = Math.max(1, Math.floor(origHeight / superpixelHeight))

  if (gridWidth < 1 || gridHeight < 1) {
    return { ok: false, status: 400, stage: "validation", reason: "Superpixel size too large for image" }
  }

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? "project_images"))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())

  // Determine output format
  const outputFormat = pickOutputFormat(src.format)

  try {
    // Call Python service for pixelation
    const imageBase64 = srcBuffer.toString("base64")

    const response = await fetch(`${PYTHON_SERVICE_URL}/filters/pixelate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        superpixel_width: superpixelWidth,
        superpixel_height: superpixelHeight,
        color_mode: params.colorMode,
        num_colors: numColors,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        ok: false,
        status: response.status,
        stage: "pixelate_process",
        reason: `Python service error: ${error}`,
      }
    }

    const outputBuffer = Buffer.from(await response.arrayBuffer())

    const imageId = crypto.randomUUID()
    const objectPath = `projects/${projectId}/images/${imageId}`

    const { error: uploadErr } = await supabase.storage
      .from("project_images")
      .upload(objectPath, outputBuffer, {
        contentType: contentTypeFor(outputFormat),
        upsert: false,
      })

    if (uploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload pixelated image" }
    }

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      role: "asset",
      name: `${src.name.replace(/ \(filter working\)| \(pixelate\)| \(line art\)| \(numerate\)/g, "")} (pixelate)`,
      format: outputFormat,
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

    return {
      ok: true,
      id: imageId,
      storagePath: objectPath,
      widthPx: origWidth,
      heightPx: origHeight,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pixelate process failed"
    return { ok: false, status: 500, stage: "pixelate_process", reason: msg }
  }
}
