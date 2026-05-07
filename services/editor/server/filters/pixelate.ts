import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"
import { callFilterService, contentTypeFor, pickOutputFormat, toInt } from "./_helpers"

type PixelateFailStage =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | "pixelate_process"
  | "service_unavailable"
  | "auth"
  | "storage_upload"
  | "db_insert"
  | "transform_sync"
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
    const imageBase64 = srcBuffer.toString("base64")

    const callResult = await callFilterService({
      path: "/filters/pixelate",
      body: {
        image_base64: imageBase64,
        superpixel_width: superpixelWidth,
        superpixel_height: superpixelHeight,
        color_mode: params.colorMode,
        num_colors: numColors,
      },
    })

    if (!callResult.ok) {
      return {
        ok: false,
        status: callResult.status,
        stage: callResult.stage === "service_unavailable" ? "service_unavailable" : callResult.stage === "auth" ? "auth" : "pixelate_process",
        reason: callResult.reason,
      }
    }

    const outputBuffer = Buffer.from(callResult.bytes)

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
      kind: "filter_working_copy",
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
    const msg = e instanceof Error ? e.message : "Pixelate process failed"
    return { ok: false, status: 500, stage: "pixelate_process", reason: msg }
  }
}
