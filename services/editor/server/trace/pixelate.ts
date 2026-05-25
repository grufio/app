import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { computeImagePlacementPx } from "@/lib/editor/image-placement"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  centeredCropPixels,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import { GEOMETRY_PPI, pxUToPxNumber } from "@/lib/editor/units"
import { callFilterService, startFilterProfiler, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { readTracePalette } from "@/lib/supabase/palette"

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

/** Master-image display state on the artboard, in mm + µpx.
 *
 * The pixelate grid is sized in display-mm (what the user sees on the
 * artboard is what they get), and the trace's centred display rect
 * needs the master's x/y/w/h in µpx so we can shift the smaller
 * trace into the master's centre with one server-side computation.
 * State preferred (after any positioning the user did); fresh-upload
 * fallback uses `computeImagePlacementPx` and leaves x/y null (no
 * persisted origin → trace centres at 0n, the canvas's default
 * paint origin). */
type MasterStateOk = {
  ok: true
  displayMmW: number
  displayMmH: number
  xPxU: bigint | null
  yPxU: bigint | null
  widthPxU: bigint
  heightPxU: bigint
}

async function resolveMasterState(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<MasterStateOk | { ok: false; reason: string }> {
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

  // State is anchored at working_copy.id post the working-copy refactor
  // (PR #257). Read state row keyed there; if no working_copy or no
  // state row exists, fall back to the intrinsic-based default
  // placement below (= fresh-upload behaviour).
  const { data: workingCopy } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "working_copy")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const stateAnchorId = workingCopy?.id ?? null
  const { data: state } = stateAnchorId
    ? await supabase
        .from("project_image_state")
        .select("x_px_u,y_px_u,width_px_u,height_px_u")
        .eq("project_id", projectId)
        .eq("image_id", stateAnchorId)
        .maybeSingle()
    : { data: null }

  const stateW = parsePxU(state?.width_px_u)
  const stateH = parsePxU(state?.height_px_u)
  if (stateW && stateH) {
    return {
      ok: true,
      displayMmW: pxToMm(pxUToPxNumber(stateW)),
      displayMmH: pxToMm(pxUToPxNumber(stateH)),
      xPxU: parsePxU(state?.x_px_u),
      yPxU: parsePxU(state?.y_px_u),
      widthPxU: stateW,
      heightPxU: stateH,
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
    xPxU: null,
    yPxU: null,
    widthPxU: BigInt(Math.round(placement.widthPx * 1_000_000)),
    heightPxU: BigInt(Math.round(placement.heightPx * 1_000_000)),
  }
}

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
  const { num_colors: numColors, color_mode: colorMode } = parsed.data

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
    const imageBase64 = srcBuffer.toString("base64")
    profiler.mark("base64_encode")

    // Snap cells to the active Munsell palette server-side: colour →
    // lab_munsell (128), b/w → lab_grays (48). Read from the DB and passed
    // to the filter-service, which does the OKLab nearest-match.
    const palette = await readTracePalette(supabase, colorMode)
    profiler.mark("palette_read")

    const callResult = await callFilterService({
      path: "/filters/pixelate",
      responseKind: "json",
      body: {
        image_base64: imageBase64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        crop_x: crop.x,
        crop_y: crop.y,
        crop_w: crop.w,
        crop_h: crop.h,
        // stroke_width is fixed at 1px — it's not a user-facing knob.
        stroke_width: 1,
        num_colors: numColors,
        palette_oklab: palette.map((c) => c.oklab),
        palette_rgb: palette.map((c) => c.rgb),
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

    // Both bitmap + SVG are stored at their actual crop dimensions.
    // The canvas renders them inside the per-trace display rect
    // (see `displayRectPxU` above) so they sit in the centred crop
    // region of the master without any stretch.
    const svgBuffer = Buffer.from(svgString, "utf-8")
    const baseBuffer = Buffer.from(croppedB64, "base64")
    // Crop bounds (clamped to the source image) — matches the math
    // in filter-service/app/pixelate.py:104-107 so the stored bitmap
    // dimensions describe the actual cropped region.
    const cropLeft = Math.max(0, Math.round(crop.x))
    const cropTop = Math.max(0, Math.round(crop.y))
    const croppedWidth = Math.max(1, Math.min(origWidth, Math.round(crop.x + crop.w)) - cropLeft)
    const croppedHeight = Math.max(1, Math.min(origHeight, Math.round(crop.y + crop.h)) - cropTop)

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
