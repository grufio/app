import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { computeDpiRelativePlacementPx } from "@/lib/editor/image-placement"
import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"
import { isNumerateGridValid, resolveNumerateGrid } from "@/lib/editor/trace/numerate-grid-math"
import { pxUToPxNumber } from "@/lib/editor/units"
import { callFilterService, startFilterProfiler, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

const MM_PER_INCH = 25.4

function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH
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
 * The numerate grid is sized in display-mm — what the user sees on the
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
    .select("output_dpi,width_px_u,height_px_u")
    .eq("project_id", projectId)
    .maybeSingle()
  const outputDpi = workspace?.output_dpi != null ? Number(workspace.output_dpi) : null
  if (!workspace || !outputDpi || outputDpi <= 0) {
    return { ok: false, reason: "Project workspace is missing or has invalid output_dpi" }
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
      displayMmW: pxToMm(pxUToPxNumber(stateW), outputDpi),
      displayMmH: pxToMm(pxUToPxNumber(stateH), outputDpi),
    }
  }

  // Fresh-upload fallback: use the same DPI-relative placement the
  // Master-Upload flow uses to seed initial state. Keeps the wizard
  // bedienbar without requiring the user to manually position first.
  const artWPxU = parsePxU(workspace.width_px_u)
  const artHPxU = parsePxU(workspace.height_px_u)
  if (!artWPxU || !artHPxU) {
    return { ok: false, reason: "Workspace size missing (width_px_u/height_px_u)" }
  }
  const placement = computeDpiRelativePlacementPx({
    artW: pxUToPxNumber(artWPxU),
    artH: pxUToPxNumber(artHPxU),
    intrinsicW: Number(master.width_px ?? 0),
    intrinsicH: Number(master.height_px ?? 0),
    artboardDpi: outputDpi,
    imageDpi: master.dpi == null ? null : Number(master.dpi),
  })
  if (!placement) {
    return { ok: false, reason: "Could not derive initial placement for master" }
  }
  return {
    ok: true,
    displayMmW: pxToMm(placement.widthPx, outputDpi),
    displayMmH: pxToMm(placement.heightPx, outputDpi),
  }
}

/**
 * Numerate writes two paired image rows: the SVG (`trace_output`)
 * and the source-bitmap cropped to the grid (`trace_base`). The
 * caller links them via `project_image_trace.base_image_id` so
 * tombstoning and editor display stay in sync.
 */
export type NumerateFilterSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  baseId: string
  baseStoragePath: string
}
export type NumerateFilterResult = NumerateFilterSuccess | Extract<FilterResult<"numerate_process">, { ok: false }>

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
  // what they get. State-anchored at master.id; fresh-upload fallback
  // uses the same placement algorithm as the upload flow.
  const display = await resolveSourceDisplayMm({ supabase, projectId })
  if (!display.ok) {
    // Workspace / master / state missing — preconditions unmet. Surfaced
    // as `validation` because the FilterFailStage union doesn't have a
    // dedicated bucket; the reason text carries the specifics.
    return { ok: false, status: 400, stage: "validation", reason: display.reason }
  }
  profiler.mark("display_mm_resolve")

  const grid = resolveNumerateGrid(display.displayMmW, display.displayMmH, parsed.data)
  if (!isNumerateGridValid(grid)) {
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
  // symmetrically on both axes.
  const sourcePxPerMmX = origWidth / display.displayMmW
  const sourcePxPerMmY = origHeight / display.displayMmH
  const cropW = grid.usedMmW * sourcePxPerMmX
  const cropH = grid.usedMmH * sourcePxPerMmY
  const cropX = (origWidth - cropW) / 2
  const cropY = (origHeight - cropH) / 2

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
        stage: callResult.stage === "service_unavailable" ? "service_unavailable" : callResult.stage === "auth" ? "auth" : "numerate_process",
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
        stage: "numerate_process",
        reason: "Filter service returned an unexpected payload (missing svg or cropped bitmap)",
      }
    }

    const svgBuffer = Buffer.from(svgString, "utf-8")
    const baseBuffer = Buffer.from(croppedB64, "base64")

    // The SVG's viewBox is the crop size (Python emits no
    // translate-offset any more); the bitmap row carries the same
    // dimensions so the editor renders them 1:1.
    const baseWidthPx = Math.max(1, Math.round(cropW))
    const baseHeightPx = Math.max(1, Math.round(cropH))

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
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload numerate base image" }
    }

    const { error: baseInsertErr } = await supabase.from("project_images").insert({
      id: baseId,
      project_id: projectId,
      kind: "trace_base",
      name: `${cleanName} (numerate base)`,
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
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload numerate image" }
    }
    profiler.mark("storage_upload")

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "trace_output",
      name: `${cleanName} (numerate)`,
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

    profiler.report("numerate", {
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
    const msg = e instanceof Error ? e.message : "Numerate process failed"
    return { ok: false, status: 500, stage: "numerate_process", reason: msg }
  }
}
