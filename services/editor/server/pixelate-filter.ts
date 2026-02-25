import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

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

  try {
    let pipeline = sharp(srcBuffer)

    // Step 1: Resize down to grid dimensions
    pipeline = pipeline.resize(gridWidth, gridHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })

    // Step 2: Apply grayscale if requested
    if (params.colorMode === "grayscale") {
      pipeline = pipeline.grayscale()
    }

    // Step 3: Color quantization
    // Sharp's PNG palette mode provides color quantization
    const outputFormat = pickOutputFormat(src.format)
    if (outputFormat === "png") {
      pipeline = pipeline.png({ palette: true, colors: numColors, quality: 100 })
    } else if (outputFormat === "jpeg") {
      pipeline = pipeline.jpeg({ quality: 95 })
    } else {
      pipeline = pipeline.webp({ quality: 95 })
    }

    // Convert to buffer to apply color reduction
    const intermediateBuffer = await pipeline.toBuffer()

    // Step 4: Resize back up to original dimensions using nearest-neighbor
    let finalPipeline = sharp(intermediateBuffer).resize(origWidth, origHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })

    // Re-encode with same format
    if (outputFormat === "png") {
      finalPipeline = finalPipeline.png({ quality: 100, compressionLevel: 6 })
    } else if (outputFormat === "jpeg") {
      finalPipeline = finalPipeline.jpeg({ quality: 95 })
    } else {
      finalPipeline = finalPipeline.webp({ quality: 95 })
    }

    const outputBuffer = await finalPipeline.toBuffer()

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
      name: `${src.name} (pixelate)`,
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
