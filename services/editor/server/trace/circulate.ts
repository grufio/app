import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import {
  circulateEllipseFractions,
  isCirculateGridValid,
  resolveCirculateGrid,
} from "@/lib/editor/trace/circulate-grid-math"
import { centeredCropPixels } from "@/lib/editor/trace/pixelate-grid-math"
import { resolveInnerFilter } from "@/lib/editor/trace/inner-color-filters"
import { cellAreaAverages } from "@/lib/editor/trace/trace-cell-colors"
import { callFilterService, startFilterProfiler, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { readTracePalette } from "@/lib/supabase/palette"
import { resolveMasterState } from "@/services/editor/server/trace/master-state"

/**
 * Circulate writes two paired image rows like Pixelate: the SVG
 * (`trace_output`) and the source cropped to the grid (`trace_base`). The
 * caller links them via `project_image_trace.base_image_id`. Circulate is
 * non-destructive — it does NOT mutate `project_image_state`; the trace is a
 * pure overlay on the working_copy at its current display rect.
 *
 * Geometry is resolved here (mm → cells, crop, ellipse fractions, contour px)
 * and the Python service (`/filters/circulate`) renders the ellipses in
 * crop-pixel space — the service stays mm-agnostic, mirroring Pixelate.
 */
export type CirculateFilterSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  baseId: string
  baseStoragePath: string
  /** Apply-time master/working_copy display rect (µpx), frozen onto the
   * project_image_trace row by the orchestrator. `xPxU`/`yPxU` null when no
   * persisted origin (fresh-upload fallback → centre at 0n). */
  displayRectPxU: {
    xPxU: bigint | null
    yPxU: bigint | null
    widthPxU: bigint
    heightPxU: bigint
  }
}
export type CirculateFilterResult = CirculateFilterSuccess | Extract<FilterResult<"circulate_process">, { ok: false }>

export async function circulateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: CirculateParams
}): Promise<CirculateFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const profiler = startFilterProfiler()
  const parsed = circulateSchema.safeParse(params)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: `Invalid circulate params: ${issues || "unknown"}`,
    }
  }
  const p = parsed.data
  const colorMode = p.color_mode

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

  // Resolve the image's displayed size + origin on the artboard (shared with
  // pixelate); the grid is sized in display-mm.
  const masterState = await resolveMasterState({ supabase, projectId })
  if (!masterState.ok) {
    return { ok: false, status: 400, stage: "validation", reason: masterState.reason }
  }
  profiler.mark("display_mm_resolve")

  const grid = resolveCirculateGrid(masterState.displayMmW, masterState.displayMmH, p)
  if (!isCirculateGridValid(grid)) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Cell pitch too large for the image on the artboard — no whole cell fits",
    }
  }

  // Same centred-crop math as pixelate (shared helper). Border pixels that
  // don't make a whole cell are dropped symmetrically on both axes.
  const crop = centeredCropPixels({
    pixelW: origWidth,
    pixelH: origHeight,
    displayMmW: masterState.displayMmW,
    displayMmH: masterState.displayMmH,
    grid,
  })

  // Ellipse axes → fractions of the cell pitch (the renderer draws in
  // crop-pixel space). Contour mm → px using the crop's px-per-mm (averaged
  // over both axes so a non-square cell doesn't bias the stroke).
  const fracs = circulateEllipseFractions(grid, p)
  const pxPerMmX = crop.w / grid.usedMmW
  const pxPerMmY = crop.h / grid.usedMmH
  const contourWidthPx = p.contour_width_mm * ((pxPerMmX + pxPerMmY) / 2)
  // Resolve the chosen inner sub colour filter to OKLab deltas here (the
  // preset table is the single TS source); Python applies them generically.
  const innerAdj = resolveInnerFilter(p.inner_filter)

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())
  profiler.mark("source_download")

  try {
    // Crop bounds (clamped to the source image) — mirror of the Python
    // legacy path's math in `filter-service/app/circulate.py` so the stored
    // bitmap dimensions describe the actual cropped region either way.
    const cropLeft = Math.max(0, Math.round(crop.x))
    const cropTop = Math.max(0, Math.round(crop.y))
    const croppedWidth = Math.max(1, Math.min(origWidth, Math.round(crop.x + crop.w)) - cropLeft)
    const croppedHeight = Math.max(1, Math.min(origHeight, Math.round(crop.y + crop.h)) - cropTop)

    // Single sharp pipeline, two outputs from the cropped region (mirrors
    // pixelate post-#323):
    //   - baseBuffer: PNG bytes for the `trace_base` Supabase row
    //   - rawRgb: alpha-stripped raw RGB for the per-cell area-average
    // Sending only the per-cell grid to Cloud Run (~22 KB for a 100×75 grid
    // vs. multi-MB for a base64'd source) avoids the Cloud Run decode +
    // crop + downsample that was causing /filters/circulate 500s on real
    // photos.
    const extracted = sharp(srcBuffer).extract({
      left: cropLeft,
      top: cropTop,
      width: croppedWidth,
      height: croppedHeight,
    })
    const [baseBuffer, rawRgb] = await Promise.all([
      extracted.clone().webp({ lossless: true }).toBuffer(),
      extracted.clone().removeAlpha().raw().toBuffer(),
    ])
    profiler.mark("sharp_crop")

    const { r, g, b } = cellAreaAverages({
      rgba: rawRgb,
      width: croppedWidth,
      height: croppedHeight,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      bytesPerPixel: 3,
    })
    profiler.mark("cell_averages")

    const cellBytes = new Uint8Array(grid.cellsX * grid.cellsY * 3)
    for (let i = 0; i < r.length; i += 1) {
      cellBytes[i * 3] = r[i]
      cellBytes[i * 3 + 1] = g[i]
      cellBytes[i * 3 + 2] = b[i]
    }
    const cellsB64 = Buffer.from(cellBytes).toString("base64")

    // Snap cells to the active Munsell palette server-side: colour →
    // lab_munsell (128), b/w → lab_grays (48). Same contract as pixelate.
    const palette = await readTracePalette(supabase, colorMode)
    profiler.mark("palette_read")

    const callResult = await callFilterService({
      path: "/filters/circulate",
      responseKind: "json",
      body: {
        cells_b64: cellsB64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        cropped_w_px: croppedWidth,
        cropped_h_px: croppedHeight,
        outer_w_frac: fracs.outerWFrac,
        outer_h_frac: fracs.outerHFrac,
        inner_enabled: p.inner_enabled,
        inner_w_frac: fracs.innerWFrac,
        inner_h_frac: fracs.innerHFrac,
        contour_width_px: contourWidthPx,
        inner_hue_deg: innerAdj.hueDeg,
        inner_lightness_delta: innerAdj.lightnessDelta,
        inner_chroma_scale: innerAdj.chromaScale,
        palette_oklab: palette.map((c) => c.oklab),
        palette_rgb: palette.map((c) => c.rgb),
        // Texture forwarding — same contract as pixelate. Applies to the
        // outer ellipses only on the server side.
        texture_enabled: p.texture_enabled,
        texture_strength: p.texture_strength,
      },
    })
    profiler.mark("filter_service")

    if (!callResult.ok) {
      return {
        ok: false,
        status: callResult.status,
        stage:
          callResult.stage === "service_unavailable"
            ? "service_unavailable"
            : callResult.stage === "auth"
              ? "auth"
              : "circulate_process",
        reason: callResult.reason,
      }
    }

    const payload = callResult.json as
      | { svg?: unknown; region_count?: unknown }
      | null
    const svgString = typeof payload?.svg === "string" ? payload.svg : null
    if (!svgString) {
      return {
        ok: false,
        status: 502,
        stage: "circulate_process",
        reason: "Filter service returned an unexpected payload (missing svg)",
      }
    }

    const svgBuffer = Buffer.from(svgString, "utf-8")

    const cleanName = src.name.replace(
      / \((?:filter working|pixelate|circulate|line art|numerate|B&W hard|B&W soft|B&W warm)\)/g,
      "",
    )

    // Write trace_base first so trace_output.source_image_id can reference it.
    const baseId = crypto.randomUUID()
    const baseObjectPath = `projects/${projectId}/images/${baseId}`
    const { error: baseUploadErr } = await supabase.storage
      .from("project_images")
      .upload(baseObjectPath, baseBuffer, {
        contentType: "image/webp",
        upsert: false,
      })
    if (baseUploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload circulate base image" }
    }

    const { error: baseInsertErr } = await supabase.from("project_images").insert({
      id: baseId,
      project_id: projectId,
      kind: "trace_base",
      name: `${cleanName} (circulate base)`,
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
      .from("project_images")
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
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload circulate image" }
    }
    profiler.mark("storage_upload")

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "trace_output",
      name: `${cleanName} (circulate)`,
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
    profiler.mark("db_insert")

    profiler.report("circulate", {
      python_phases: callResult.phases,
      output_bytes: svgBuffer.byteLength,
      base_bytes: baseBuffer.byteLength,
      width: croppedWidth,
      height: croppedHeight,
    })

    return {
      ok: true,
      id: imageId,
      storagePath: objectPath,
      widthPx: croppedWidth,
      heightPx: croppedHeight,
      baseId,
      baseStoragePath: baseObjectPath,
      // Freeze the apply-time master/working_copy display rect — same
      // authoritative read that sized the grid above.
      displayRectPxU: {
        xPxU: masterState.xPxU,
        yPxU: masterState.yPxU,
        widthPxU: masterState.widthPxU,
        heightPxU: masterState.heightPxU,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Circulate process failed"
    return { ok: false, status: 500, stage: "circulate_process", reason: msg }
  }
}
