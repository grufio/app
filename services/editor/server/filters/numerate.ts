import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8001"

type NumerateFailStage =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | "numerate_process"
  | "storage_upload"
  | "db_insert"
  | "transform_sync"
  | "active_switch"

type NumerateFailure = {
  ok: false
  status: number
  stage: NumerateFailStage
  reason: string
  code?: string
}

type NumerateSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
}

export type NumerateFilterResult = NumerateSuccess | NumerateFailure

type NumerateParams = {
  superpixelWidth: number
  superpixelHeight: number
  strokeWidth: number
  showColors: boolean
}

function toInt(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const n = Math.round(value)
  if (n < 0) return null
  return n
}

export async function numerateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: NumerateParams
}): Promise<NumerateFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const superpixelWidth = toInt(params.superpixelWidth)
  const superpixelHeight = toInt(params.superpixelHeight)
  const strokeWidth = toInt(params.strokeWidth)

  if (
    superpixelWidth == null ||
    superpixelHeight == null ||
    superpixelWidth < 1 ||
    superpixelHeight < 1 ||
    strokeWidth == null ||
    strokeWidth < 1 ||
    strokeWidth > 20
  ) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid numerate params" }
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

  try {
    const imageBase64 = srcBuffer.toString("base64")

    const response = await fetch(`${PYTHON_SERVICE_URL}/filters/numerate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        superpixel_width: superpixelWidth,
        superpixel_height: superpixelHeight,
        stroke_width: strokeWidth,
        show_colors: params.showColors,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        ok: false,
        status: response.status,
        stage: "numerate_process",
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
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload numerate image" }
    }

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      role: "asset",
      name: `${src.name.replace(/ \(filter working\)| \(pixelate\)| \(line art\)| \(numerate\)/g, "")} (numerate)`,
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
    const msg = e instanceof Error ? e.message : "Numerate process failed"
    return { ok: false, status: 500, stage: "numerate_process", reason: msg }
  }
}
