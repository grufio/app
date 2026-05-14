import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"
import { isNumerateGridValid, resolveNumerateGrid } from "@/lib/editor/trace/numerate-grid-math"
import { callFilterService, startFilterProfiler, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export type NumerateFilterResult = FilterResult<"numerate_process">

export async function numerateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: NumerateParams
}): Promise<NumerateFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const profiler = startFilterProfiler()
  const parsed = numerateSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid numerate params" }
  }
  const { stroke_width: strokeWidth, show_colors: showColors, num_colors: numColors } = parsed.data

  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,is_locked")
    .eq("id", sourceImageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()
  profiler.mark("source_lookup")

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

  // Resolve the cell grid + crop rect once, here — the single source
  // of truth shared with the wizard (`resolveNumerateGrid`). The
  // Python service just downsamples along this resolved grid.
  const grid = resolveNumerateGrid(origWidth, origHeight, parsed.data)
  if (!isNumerateGridValid(grid)) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Supercell too large for the image — no whole cell fits",
    }
  }

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())
  profiler.mark("source_download")

  try {
    const imageBase64 = srcBuffer.toString("base64")
    profiler.mark("base64_encode")

    const callResult = await callFilterService({
      path: "/filters/numerate",
      body: {
        image_base64: imageBase64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        crop_x: grid.cropX,
        crop_y: grid.cropY,
        crop_w: grid.cropW,
        crop_h: grid.cropH,
        stroke_width: strokeWidth,
        show_colors: showColors,
        num_colors: numColors,
      },
    })
    profiler.mark("filter_service")

    if (!callResult.ok) {
      return {
        ok: false,
        status: callResult.status,
        stage: callResult.stage === "service_unavailable" ? "service_unavailable" : callResult.stage === "auth" ? "auth" : "numerate_process",
        reason: callResult.reason,
      }
    }

    const outputBuffer = Buffer.from(callResult.bytes)

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
    profiler.mark("storage_upload")

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "trace_output",
      name: `${src.name.replace(/ \((?:filter working|pixelate|line art|numerate|B&W hard|B&W soft|B&W warm)\)/g, "")} (numerate)`,
      format: "svg",
      width_px: origWidth,
      height_px: origHeight,
      storage_bucket: PROJECT_IMAGES_BUCKET,
      storage_path: objectPath,
      file_size_bytes: outputBuffer.byteLength,
      is_active: false,
      source_image_id: sourceImageId,
    })

    if (insertErr) {
      await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
      return { ok: false, status: 400, stage: "db_insert", reason: insertErr.message, code: insertErr.code }
    }
    profiler.mark("db_insert")
    // State is anchored at master.id (see image-state route handler);
    // no per-output transform copy needed.

    profiler.report("numerate", {
      python_phases: callResult.phases,
      output_bytes: outputBuffer.byteLength,
      width: origWidth,
      height: origHeight,
    })

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
