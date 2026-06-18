import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { cellAreaAverages } from "@/lib/editor/trace/trace-cell-colors"
import { toInt } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

/**
 * Identical blocks pulled out of `pixelate.ts` and `circulate.ts`: the
 * source-image lookup, the storage download, the sharp crop +
 * cell-grid build, and the two-row trace_base / trace_output write
 * with rollback. The handler-specific parts (grid math + filter-
 * service request body) stay inline in the per-kind handler.
 *
 * Per the audit (M6): the handler bodies are roughly 60% structurally
 * identical, not 95% — so a generic "applyTraceFilter()" wrapper
 * would be premature abstraction for just two kinds. These four
 * helpers cover the genuinely-identical surface (source / palette /
 * upload) without dragging the diverging parts into a single
 * parameterised function.
 */

type TraceCommonError = {
  ok: false
  status: number
  stage: "source_lookup" | "validation" | "source_download" | "storage_upload" | "db_insert"
  reason: string
  code?: string
}

type TraceSourceImage = {
  id: string
  name: string
  storage_bucket: string | null
  storage_path: string | null
  format: string | null
  width_px: number | null
  height_px: number | null
}

export type FetchedTraceSource = {
  ok: true
  src: TraceSourceImage
  origWidth: number
  origHeight: number
}

/**
 * Source image SELECT + lock check + dimension validation. Returns
 * the row, intrinsic dimensions (clamped + validated to be positive
 * ints), or one of the common error stages.
 *
 * Stages emitted on failure: `source_lookup` (404, missing or
 * RLS-denied), `validation` (400, width or height is missing / <1).
 */
export async function fetchTraceSourceImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
}): Promise<FetchedTraceSource | TraceCommonError> {
  const { supabase, projectId, sourceImageId } = args
  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px")
    .eq("id", sourceImageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()

  if (srcErr || !src) {
    return { ok: false, status: 404, stage: "source_lookup", reason: "Source image not found", code: srcErr?.code }
  }

  const origWidth = toInt(src.width_px)
  const origHeight = toInt(src.height_px)
  if (origWidth == null || origHeight == null || origWidth < 1 || origHeight < 1) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid source dimensions" }
  }

  return { ok: true, src, origWidth, origHeight }
}

export type DownloadedSourceBuffer = { ok: true; buffer: Buffer }

/**
 * Storage download → Buffer. Returns the raw bytes for the
 * downstream sharp pipeline. Bucket defaults to the canonical
 * `PROJECT_IMAGES_BUCKET` when the row doesn't carry an explicit
 * `storage_bucket` (legacy rows).
 */
export async function downloadSourceImageBuffer(args: {
  supabase: SupabaseClient<Database>
  src: TraceSourceImage
}): Promise<DownloadedSourceBuffer | TraceCommonError> {
  const { supabase, src } = args
  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  return { ok: true, buffer: Buffer.from(await srcBlob.arrayBuffer()) }
}

export type CellsPayload = {
  cellsB64: string
  baseBuffer: Buffer
  cropLeft: number
  cropTop: number
  croppedWidth: number
  croppedHeight: number
}

/**
 * Sharp crop pipeline: produces a base WebP buffer (for the
 * `trace_base` row) and the per-cell area-averaged grid as a
 * base64 byte payload for the filter service. The base bitmap and
 * the cell grid both come from the same single sharp extract — no
 * redundant decode.
 *
 * Crop bounds are clamped to the source image (mirror of the Python
 * legacy path's math). Cell dimensions are determined by the
 * caller-provided grid.
 */
export async function buildCellsPayload(args: {
  srcBuffer: Buffer
  origWidth: number
  origHeight: number
  crop: { x: number; y: number; w: number; h: number }
  grid: { cellsX: number; cellsY: number }
}): Promise<CellsPayload> {
  const { srcBuffer, origWidth, origHeight, crop, grid } = args
  const cropLeft = Math.max(0, Math.round(crop.x))
  const cropTop = Math.max(0, Math.round(crop.y))
  const croppedWidth = Math.max(1, Math.min(origWidth, Math.round(crop.x + crop.w)) - cropLeft)
  const croppedHeight = Math.max(1, Math.min(origHeight, Math.round(crop.y + crop.h)) - cropTop)

  const extracted = sharp(srcBuffer).extract({
    left: cropLeft,
    top: cropTop,
    width: croppedWidth,
    height: croppedHeight,
  })
  const [baseBuffer, rawRgb] = await Promise.all([
    extracted.clone().webp({ quality: 90 }).toBuffer(),
    extracted.clone().removeAlpha().raw().toBuffer(),
  ])

  const { r, g, b } = cellAreaAverages({
    rgba: rawRgb,
    width: croppedWidth,
    height: croppedHeight,
    cellsX: grid.cellsX,
    cellsY: grid.cellsY,
    bytesPerPixel: 3,
  })

  const cellBytes = new Uint8Array(grid.cellsX * grid.cellsY * 3)
  for (let i = 0; i < r.length; i += 1) {
    cellBytes[i * 3] = r[i]
    cellBytes[i * 3 + 1] = g[i]
    cellBytes[i * 3 + 2] = b[i]
  }
  const cellsB64 = Buffer.from(cellBytes).toString("base64")

  return { cellsB64, baseBuffer, cropLeft, cropTop, croppedWidth, croppedHeight }
}

/**
 * Strip any prior filter / trace suffix from the source image name
 * so the new outputs read e.g. "Photo (pixelate base)" instead of
 * "Photo (filter working) (circulate) (pixelate base)". Centralises
 * the regex (both pixelate and circulate carried near-duplicate
 * versions; only one of them stripped "circulate").
 */
export function stripTraceSuffix(name: string): string {
  return name.replace(
    / \((?:filter working|pixelate|circulate|line art|numerate|B&W hard|B&W soft|B&W warm)\)/g,
    "",
  )
}

export type WrittenTraceOutputs = {
  ok: true
  baseId: string
  baseObjectPath: string
  imageId: string
  objectPath: string
}

/**
 * Atomic-ish trace_base + trace_output write with manual rollback.
 *
 * Ordering: trace_base storage upload → trace_base DB insert →
 * trace_output storage upload → trace_output DB insert. Each step
 * cleans up any earlier successful step on failure (storage object
 * remove + soft-delete on trace_base row) — we can't soft-delete
 * trace_base before trace_output exists because the FK is ON DELETE
 * RESTRICT, but no project_image_trace row exists yet at this stage
 * so the constraint can't fire either way.
 *
 * `kind` drives the name suffix + the per-kind error-stage label
 * used in the messages (the caller's stage is `<kind>_process`).
 */
export async function writeTraceOutputs(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  kind: "pixelate" | "circulate"
  cleanName: string
  baseBuffer: Buffer
  svgBuffer: Buffer
  croppedWidth: number
  croppedHeight: number
}): Promise<WrittenTraceOutputs | TraceCommonError> {
  const { supabase, projectId, sourceImageId, kind, cleanName, baseBuffer, svgBuffer, croppedWidth, croppedHeight } = args

  const baseId = crypto.randomUUID()
  const baseObjectPath = `projects/${projectId}/images/${baseId}`
  const { error: baseUploadErr } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(baseObjectPath, baseBuffer, {
      contentType: "image/webp",
      upsert: false,
    })
  if (baseUploadErr) {
    return { ok: false, status: 500, stage: "storage_upload", reason: `Failed to upload ${kind} base image` }
  }

  const { error: baseInsertErr } = await supabase.from("project_images").insert({
    id: baseId,
    project_id: projectId,
    kind: "trace_base",
    name: `${cleanName} (${kind} base)`,
    format: "webp",
    width_px: croppedWidth,
    height_px: croppedHeight,
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: baseObjectPath,
    file_size_bytes: baseBuffer.byteLength,
    is_active: false,
    source_image_id: sourceImageId,
  })
  if (baseInsertErr) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([baseObjectPath])
    return { ok: false, status: 400, stage: "db_insert", reason: baseInsertErr.message, code: baseInsertErr.code }
  }

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`

  const { error: uploadErr } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(objectPath, svgBuffer, {
      contentType: "image/svg+xml",
      upsert: false,
    })

  if (uploadErr) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([baseObjectPath])
    await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", baseId)
    return { ok: false, status: 500, stage: "storage_upload", reason: `Failed to upload ${kind} image` }
  }

  const { error: insertErr } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    kind: "trace_output",
    name: `${cleanName} (${kind})`,
    format: "svg",
    width_px: croppedWidth,
    height_px: croppedHeight,
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: objectPath,
    file_size_bytes: svgBuffer.byteLength,
    is_active: false,
    source_image_id: baseId,
  })

  if (insertErr) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath, baseObjectPath])
    await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", baseId)
    return { ok: false, status: 400, stage: "db_insert", reason: insertErr.message, code: insertErr.code }
  }

  return { ok: true, baseId, baseObjectPath, imageId, objectPath }
}
