import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  centeredCropPixels,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import { cellAreaAverages } from "@/lib/editor/trace/trace-cell-colors"
import { callFilterService, startFilterProfiler, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { readTracePalette } from "@/lib/supabase/palette"
import { resolveMasterState } from "@/services/editor/server/trace/master-state"

/**
 * Pixelate writes two paired image rows: the SVG (`trace_output`)
 * and the source-bitmap cropped to the grid (`trace_base`). The
 * caller links them via `project_image_trace.base_image_id` so
 * tombstoning and editor display stay in sync.
 *
 * Pixelate is non-destructive (post the working-copy refactor): it
 * does NOT mutate `project_image_state` on apply. The trace is a
 * pure overlay — bitmap + SVG cells sit on top of the working_copy
 * at the working_copy's current display rect. The floor-grid
 * remainder (e.g. 2mm at 200mm working_copy + 6mm cells) is the
 * uncovered border where the working_copy is visible underneath.
 */
export type PixelateFilterSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  baseId: string
  baseStoragePath: string
  /** The master/working_copy display rect that was authoritative at
   * apply time (µpx). Captured ONCE here from `resolveMasterState`
   * (the same DB read that sizes the grid) so the orchestrator can
   * freeze it onto the project_image_trace row. The trace overlay
   * later renders from this rect, decoupled from the live canvas
   * transform. `xPxU`/`yPxU` are null when no persisted origin
   * exists (fresh-upload fallback) — the trace then centres at 0n,
   * the canvas's default paint origin. */
  displayRectPxU: {
    xPxU: bigint | null
    yPxU: bigint | null
    widthPxU: bigint
    heightPxU: bigint
  }
}
export type PixelateFilterResult = PixelateFilterSuccess | Extract<FilterResult<"pixelate_process">, { ok: false }>

export async function pixelateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: PixelateParams
}): Promise<PixelateFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const profiler = startFilterProfiler()
  const parsed = pixelateSchema.safeParse(params)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: `Invalid pixelate params: ${issues || "unknown"}`,
    }
  }
  const { color_mode: colorMode } = parsed.data

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

  // Resolve the image's displayed size + origin on the artboard.
  // `project_image_state` is authoritative (anchored at working_copy.id,
  // PR #257); the trace apply path in `handleApplyTrace` awaits any
  // pending state save before calling /trace, so the DB row is
  // guaranteed to be current when this handler runs.
  const masterState = await resolveMasterState({ supabase, projectId })
  if (!masterState.ok) {
    return { ok: false, status: 400, stage: "validation", reason: masterState.reason }
  }
  profiler.mark("display_mm_resolve")

  const grid = resolvePixelateGrid(masterState.displayMmW, masterState.displayMmH, parsed.data)
  if (!isPixelateGridValid(grid)) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Superpixel too large for the image on the artboard — no whole cell fits",
    }
  }

  // Translate the mm-space crop back into source-pixel coordinates for
  // the Python service. The source bitmap may have arbitrary dimensions;
  // we only need the cropped-out area to render the cells from. Border
  // pixels (the parts that don't make a whole superpixel) are dropped
  // symmetrically on both axes. Shared helper keeps the math byte-
  // identical to the client-side preview.
  const crop = centeredCropPixels({
    pixelW: origWidth,
    pixelH: origHeight,
    displayMmW: masterState.displayMmW,
    displayMmH: masterState.displayMmH,
    grid,
  })

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
    // legacy path's math in `filter-service/app/pixelate.py` so the stored
    // bitmap dimensions describe the actual cropped region either way.
    const cropLeft = Math.max(0, Math.round(crop.x))
    const cropTop = Math.max(0, Math.round(crop.y))
    const croppedWidth = Math.max(1, Math.min(origWidth, Math.round(crop.x + crop.w)) - cropLeft)
    const croppedHeight = Math.max(1, Math.min(origHeight, Math.round(crop.y + crop.h)) - cropTop)

    // Single sharp pipeline, two outputs from the cropped region:
    //   - baseBuffer: PNG bytes for the `trace_base` Supabase row
    //   - rawRgb: alpha-stripped raw RGB for the per-cell area-average
    // Sending only the per-cell grid to Cloud Run (~22 KB for a 100×75
    // grid vs ~16 MB for a 12-MP base64 source) is what eliminates the
    // empty-body 500s — Cloud Run's heavy decode + downsample go away.
    const extracted = sharp(srcBuffer).extract({
      left: cropLeft,
      top: cropTop,
      width: croppedWidth,
      height: croppedHeight,
    })
    const [baseBuffer, rawRgb] = await Promise.all([
      extracted.clone().png().toBuffer(),
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

    // Snap cells to the active Munsell palette: colour → lab_munsell (128),
    // b/w → lab_grays (48). Read from the DB and passed to the filter-
    // service, which does the OKLab nearest-match.
    const palette = await readTracePalette(supabase, colorMode)
    profiler.mark("palette_read")

    const callResult = await callFilterService({
      path: "/filters/pixelate",
      responseKind: "json",
      body: {
        cells_b64: cellsB64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        cropped_w_px: croppedWidth,
        cropped_h_px: croppedHeight,
        palette_oklab: palette.map((c) => c.oklab),
        palette_rgb: palette.map((c) => c.rgb),
        // Texture: forwarded as-is. The filter-service no-ops when
        // `texture_enabled` is false (or `texture_strength` is 0), and older
        // Cloud Run deploys silently drop both fields (Pydantic extras
        // default-ignored) so cross-version pairings stay safe.
        texture_enabled: parsed.data.texture_enabled,
        texture_strength: parsed.data.texture_strength,
      },
    })
    profiler.mark("filter_service")

    if (!callResult.ok) {
      return {
        ok: false,
        status: callResult.status,
        stage: callResult.stage === "service_unavailable" ? "service_unavailable" : callResult.stage === "auth" ? "auth" : "pixelate_process",
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
        stage: "pixelate_process",
        reason: "Filter service returned an unexpected payload (missing svg)",
      }
    }

    // Both bitmap + SVG are stored at their actual crop dimensions.
    // The canvas renders them inside the per-trace display rect
    // (see `displayRectPxU` above) so they sit in the centred crop
    // region of the master without any stretch.
    const svgBuffer = Buffer.from(svgString, "utf-8")

    const cleanName = src.name.replace(
      / \((?:filter working|pixelate|line art|numerate|B&W hard|B&W soft|B&W warm)\)/g,
      "",
    )

    // Order matters: write trace_base first so the trace_output row's
    // source_image_id can reference it. If trace_output fails we
    // tombstone trace_base in the catch path below.
    const baseId = crypto.randomUUID()
    const baseObjectPath = `projects/${projectId}/images/${baseId}`
    const { error: baseUploadErr } = await supabase.storage
      .from("project_images")
      .upload(baseObjectPath, baseBuffer, {
        contentType: "image/png",
        upsert: false,
      })
    if (baseUploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload pixelate base image" }
    }

    const { error: baseInsertErr } = await supabase.from("project_images").insert({
      id: baseId,
      project_id: projectId,
      kind: "trace_base",
      name: `${cleanName} (pixelate base)`,
      format: "png",
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
      // Roll back the freshly-written base bitmap so storage doesn't
      // accumulate orphans. Soft-delete the DB row too — the
      // ON DELETE RESTRICT on project_image_trace.base_image_id only
      // bites once a trace row exists, which hasn't happened yet.
      await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([baseObjectPath])
      await supabase
        .from("project_images")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", baseId)
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload pixelate image" }
    }
    profiler.mark("storage_upload")

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "trace_output",
      name: `${cleanName} (pixelate)`,
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
    // State is anchored at working_copy.id (PR #257); the trace's own
    // display rect travels with the project_image_trace row (handled by
    // the orchestrator) so no per-output transform copy is needed.

    profiler.report("pixelate", {
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
      // Freeze the apply-time master/working_copy display rect onto the
      // result. `masterState` is the same authoritative DB read that
      // sized the grid above (`resolveMasterState`, :221) — reusing it
      // keeps the persisted geometry byte-consistent with what the
      // user saw on the artboard at apply time.
      displayRectPxU: {
        xPxU: masterState.xPxU,
        yPxU: masterState.yPxU,
        widthPxU: masterState.widthPxU,
        heightPxU: masterState.heightPxU,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pixelate process failed"
    return { ok: false, status: 500, stage: "pixelate_process", reason: msg }
  }
}
