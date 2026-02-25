import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8001"

type LineArtFailStage =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | "lineart_process"
  | "storage_upload"
  | "db_insert"

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
  const lineThickness = toInt(params.lineThickness)

  if (
    threshold1 == null ||
    threshold2 == null ||
    threshold1 < 0 ||
    threshold2 < 0 ||
    threshold1 >= threshold2 ||
    lineThickness == null ||
    lineThickness < 1 ||
    lineThickness > 10
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
    const imageBase64 = srcBuffer.toString("base64")

    const response = await fetch(\`\${PYTHON_SERVICE_URL}/filters/lineart\`, {
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
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        ok: false,
        status: response.status,
        stage: "lineart_process",
        reason: \`Python service error: \${error}\`,
      }
    }

    const outputBuffer = Buffer.from(await response.arrayBuffer())

    const imageId = crypto.randomUUID()
    const objectPath = \`projects/\${projectId}/images/\${imageId}\`

    const { error: uploadErr } = await supabase.storage
      .from("project_images")
      .upload(objectPath, outputBuffer, {
        contentType: "image/png",
        upsert: false,
      })

    if (uploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload line art image" }
    }

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      role: "asset",
      name: \`\${src.name} (line art)\`,
      format: "png",
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
    const msg = e instanceof Error ? e.message : "Line art process failed"
    return { ok: false, status: 500, stage: "lineart_process", reason: msg }
  }
}
