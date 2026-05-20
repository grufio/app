import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { computeImagePlacementPx } from "@/lib/editor/image-placement"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  centeredCropPixels,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import { padSvgToFullImage } from "@/lib/editor/trace/pixelate-svg-pad"
import { GEOMETRY_PPI, pxUToPxNumber } from "@/lib/editor/units"
import { callFilterService, startFilterProfiler, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

const MM_PER_INCH = 25.4

function pxToMm(px: number): number {
  return (px / GEOMETRY_PPI) * MM_PER_INCH
}

function parsePxU(value: unknown): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const v = BigInt(value)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

/** Resolve the source image's displayed size on the artboard, in mm.
 *
 * The pixelate grid is sized in display-mm — what the user sees on the
 * artboard is what they get. State preferred (after any positioning
 * the user did); fresh-upload fallback uses the same algorithm the
 * Master-Upload flow uses to seed initial placement. */
async function resolveSourceDisplayMm(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<
  | { ok: true; displayMmW: number; displayMmH: number }
  | { ok: false; reason: string }
> {
  const { supabase, projectId } = args
  const { data: workspace } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u")
    .eq("project_id", projectId)
    .maybeSingle()
  if (!workspace) {
    return { ok: false, reason: "Project workspace is missing" }
  }

  const { data: master } = await supabase
    .from("project_images")
    .select("id,width_px,height_px,dpi")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!master?.id) {
    return { ok: false, reason: "Project has no master image" }
  }

  const { data: state } = await supabase
    .from("project_image_state")
    .select("width_px_u,height_px_u")
    .eq("project_id", projectId)
    .eq("image_id", master.id)
    .maybeSingle()

  const stateW = parsePxU(state?.width_px_u)
  const stateH = parsePxU(state?.height_px_u)
  if (stateW && stateH) {
    return {
      ok: true,
      displayMmW: pxToMm(pxUToPxNumber(stateW)),
      displayMmH: pxToMm(pxUToPxNumber(stateH)),
    }
  }

  // Fresh-upload fallback: use the same placement the Master-Upload
  // flow uses to seed initial state. Keeps the wizard bedienbar
  // without requiring the user to manually position first.
  const artWPxU = parsePxU(workspace.width_px_u)
  const artHPxU = parsePxU(workspace.height_px_u)
  if (!artWPxU || !artHPxU) {
    return { ok: false, reason: "Workspace size missing (width_px_u/height_px_u)" }
  }
  const placement = computeImagePlacementPx({
    artW: pxUToPxNumber(artWPxU),
    artH: pxUToPxNumber(artHPxU),
    intrinsicW: Number(master.width_px ?? 0),
    intrinsicH: Number(master.height_px ?? 0),
    imageDpi: master.dpi == null ? null : Number(master.dpi),
  })
  if (!placement) {
    return { ok: false, reason: "Could not derive initial placement for master" }
  }
  return {
    ok: true,
    displayMmW: pxToMm(placement.widthPx),
    displayMmH: pxToMm(placement.heightPx),
  }
}

/**
 * Pixelate writes two paired image rows: the SVG (`trace_output`)
 * and the source-bitmap cropped to the grid (`trace_base`). The
 * caller links them via `project_image_trace.base_image_id` so
 * tombstoning and editor display stay in sync.
 */
export type PixelateFilterSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  baseId: string
  baseStoragePath: string
}
export type PixelateFilterResult = PixelateFilterSuccess | Extract<FilterResult<"pixelate_process">, { ok: false }>

export async function pixelateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: PixelateParams
  /** Client-supplied display-mm. When present, used directly so the
   * server doesn't fall back to potentially-stale project_image_state. */
  displayMmW?: number
  displayMmH?: number
}): Promise<PixelateFilterResult> {
  const { supabase, projectId, sourceImageId, params, displayMmW, displayMmH } = args
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
  const { num_colors: numColors } = parsed.data

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

  // Resolve the image's displayed size on the artboard (mm). The grid
  // is sized in display-mm — what the user sees on the artboard is
  // what they get. Client-supplied values win (they come from the
  // dialog's live canvas mirror); fall back to DB-side resolution
  // (state-anchored at master.id; placement-algorithm fallback) only
  // when the client didn't send them.
  const display =
    typeof displayMmW === "number" && displayMmW > 0 &&
    typeof displayMmH === "number" && displayMmH > 0
      ? ({ ok: true, displayMmW, displayMmH } as const)
      : await resolveSourceDisplayMm({ supabase, projectId })
  if (!display.ok) {
    return { ok: false, status: 400, stage: "validation", reason: display.reason }
  }
  profiler.mark("display_mm_resolve")

  const grid = resolvePixelateGrid(display.displayMmW, display.displayMmH, parsed.data)
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
    displayMmW: display.displayMmW,
    displayMmH: display.displayMmH,
    grid,
  })
  const cropX = crop.x
  const cropY = crop.y
  const cropW = crop.w
  const cropH = crop.h

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
      path: "/filters/pixelate",
      responseKind: "json",
      body: {
        image_base64: imageBase64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        crop_x: cropX,
        crop_y: cropY,
        crop_w: cropW,
        crop_h: cropH,
        // stroke_width is fixed at 1px — it's not a user-facing knob.
        stroke_width: 1,
        num_colors: numColors,
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
      | { svg?: unknown; cropped_png_b64?: unknown; region_count?: unknown }
      | null
    const svgString = typeof payload?.svg === "string" ? payload.svg : null
    const croppedB64 =
      typeof payload?.cropped_png_b64 === "string" ? payload.cropped_png_b64 : null
    if (!svgString || !croppedB64) {
      return {
        ok: false,
        status: 502,
        stage: "pixelate_process",
        reason: "Filter service returned an unexpected payload (missing svg or cropped bitmap)",
      }
    }

    // Pad both the SVG and the PNG to the master image's intrinsic
    // pixel dimensions. The trace_base / trace_output rows must match
    // master.id's intrinsic size — `project_image_state` is anchored
    // at master.id and the editor places the trace into the master's
    // display rect. If the trace bitmap is the cropped size only,
    // Konva stretches it (factor `displayMm / usedMm`) → wrong size on
    // canvas. Padding to origWidth × origHeight with transparent border
    // makes the bitmap aspect match the master, no stretch.
    const paddedSvg = padSvgToFullImage({
      pythonSvg: svgString,
      origWidth,
      origHeight,
      offsetX: cropX,
      offsetY: cropY,
    })
    const svgBuffer = Buffer.from(paddedSvg, "utf-8")

    const croppedPngBuffer = Buffer.from(croppedB64, "base64")
    const padLeft = Math.max(0, Math.round(cropX))
    const padTop = Math.max(0, Math.round(cropY))
    // `extend.right/bottom` is what's added past the existing bitmap.
    // Python's cropped PNG is `round(cropX + cropW) - max(0, round(cropX))` wide
    // (see filter-service/app/pixelate.py:104-107). We back-compute that
    // here so `padLeft + croppedWidth + padRight === origWidth`.
    const croppedWidth = Math.max(1, Math.min(origWidth, Math.round(cropX + cropW)) - padLeft)
    const croppedHeight = Math.max(1, Math.min(origHeight, Math.round(cropY + cropH)) - padTop)
    const padRight = Math.max(0, origWidth - padLeft - croppedWidth)
    const padBottom = Math.max(0, origHeight - padTop - croppedHeight)
    // `ensureAlpha` forces the pipeline into RGBA. Python returns the
    // cropped PNG in RGB mode (PIL `.convert("RGB").crop(...)`), and
    // sharp's `.extend({background:{alpha:0}})` silently drops the
    // alpha component when the input has no alpha channel — the
    // border ends up opaque (RGB only), so the trace bitmap shows
    // through wherever the SVG cells don't cover it. Forcing RGBA
    // first makes the transparent border actually transparent.
    const baseBuffer = await sharp(croppedPngBuffer)
      .ensureAlpha()
      .extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
    profiler.mark("pad_output")

    // Both rows carry the master's intrinsic dimensions so the editor
    // renders trace 1:1 against the master display rect (no stretch).
    const baseWidthPx = origWidth
    const baseHeightPx = origHeight

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
      width_px: baseWidthPx,
      height_px: baseHeightPx,
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
      width_px: baseWidthPx,
      height_px: baseHeightPx,
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
    // State is anchored at master.id (see image-state route handler);
    // no per-output transform copy needed.

    profiler.report("pixelate", {
      python_phases: callResult.phases,
      output_bytes: svgBuffer.byteLength,
      base_bytes: baseBuffer.byteLength,
      width: baseWidthPx,
      height: baseHeightPx,
    })

    return {
      ok: true,
      id: imageId,
      storagePath: objectPath,
      widthPx: baseWidthPx,
      heightPx: baseHeightPx,
      baseId,
      baseStoragePath: baseObjectPath,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pixelate process failed"
    return { ok: false, status: 500, stage: "pixelate_process", reason: msg }
  }
}
