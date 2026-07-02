import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  centeredCropPixels,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import { callFilterService, startFilterProfiler, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { readTracePalette } from "@/lib/supabase/palette"
import { compositeContentRegion } from "@/services/editor/server/trace/composite-content-region"
import { resolveTraceContentRegion } from "@/services/editor/server/trace/content-region-resolve"
import {
  buildCellsPayload,
  downloadSourceImageBuffer,
  fetchTraceSourceImage,
  stripTraceSuffix,
  writeTraceOutputs,
} from "@/services/editor/server/trace/shared"

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
 *
 * Source / palette / upload share their logic with circulate via
 * `./shared.ts`; grid math + filter-service request body stay here.
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
  /** Unique palette chip indices the snap step emitted in the output
   * (sorted ascending). Null when the filter-service didn't return
   * the field (older revision) or the response shape was unexpected. */
  paletteIndicesUsed: number[] | null
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
  const {
    color_mode: colorMode,
    num_colors: numColors,
    pre_snap_chroma_scale: preSnapChromaScale,
    dither_mode: ditherMode,
    dither_strength: ditherStrength,
    distance_metric: distanceMetric,
    palette_restriction: paletteRestriction,
  } = parsed.data

  const sourceResult = await fetchTraceSourceImage({ supabase, projectId, sourceImageId })
  profiler.mark("source_lookup")
  if (!sourceResult.ok) return sourceResult
  const { src, origWidth, origHeight } = sourceResult

  // The trace only converts the printable content rect (artboard − padding).
  // Resolve that region + its display size (mm) + the compositing plan (the
  // image over a white content-rect canvas; uncovered areas stay white).
  // `project_image_state` is authoritative (anchored at working_copy.id);
  // `handleApplyTrace` awaits any pending state save before /trace, so the row
  // is current here.
  const region = await resolveTraceContentRegion({
    supabase,
    projectId,
    intrinsicWPx: origWidth,
    intrinsicHPx: origHeight,
  })
  if (!region.ok) {
    return { ok: false, status: 400, stage: "validation", reason: region.reason }
  }
  profiler.mark("display_mm_resolve")

  const grid = resolvePixelateGrid(region.displayMmW, region.displayMmH, parsed.data)
  if (!isPixelateGridValid(grid)) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Superpixel too large for the image on the artboard — no whole cell fits",
    }
  }

  const downloadResult = await downloadSourceImageBuffer({ supabase, src })
  if (!downloadResult.ok) return downloadResult
  // Composite the source onto the content-rect canvas (white where the image
  // doesn't cover). The trace runs on this content-region bitmap.
  const contentBuffer = await compositeContentRegion({ sourceBuffer: downloadResult.buffer, plan: region.plan })
  const contentW = region.plan.canvasPx.widthPx
  const contentH = region.plan.canvasPx.heightPx
  profiler.mark("source_download")

  // Superpixel-fitting crop WITHIN the content region (drops border pixels that
  // don't make a whole cell). Byte-identical to the client-side preview.
  const crop = centeredCropPixels({
    pixelW: contentW,
    pixelH: contentH,
    displayMmW: region.displayMmW,
    displayMmH: region.displayMmH,
    grid,
  })

  try {
    // Single sharp pipeline, two outputs from the cropped region.
    const cells = await buildCellsPayload({ srcBuffer: contentBuffer, origWidth: contentW, origHeight: contentH, crop, grid })
    profiler.mark("sharp_crop")
    profiler.mark("cell_averages")

    // Snap cells to the active Munsell palette: colour → lab_munsell (128),
    // b/w → lab_grays (48). Read from the DB and passed to the filter-
    // service, which does the OKLab nearest-match.
    const palette = await readTracePalette(supabase, colorMode)
    profiler.mark("palette_read")

    const callResult = await callFilterService({
      path: "/filters/pixelate",
      responseKind: "json",
      body: {
        cells_b64: cells.cellsB64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        cropped_w_px: cells.croppedWidth,
        cropped_h_px: cells.croppedHeight,
        palette_oklab: palette.map((c) => c.oklab),
        palette_rgb: palette.map((c) => c.rgb),
        // Cap on distinct chip count in the rendered output. Drives
        // the filter-service's post-snap top-N reduction.
        num_colors: numColors,
        // Pre-snap chroma boost in OKLCh. Default 1.2 (server-side
        // default if missing).
        pre_snap_chroma_scale: preSnapChromaScale,
        // Dithering at the snap step. `dither_strength` is a fraction
        // in {0.25, 0.5, 0.75, 1.0} consumed by `knoll_yliluoma`
        // (mapped to candidate count N) and `texture` (invasion
        // strength). None and Floyd-Steinberg ignore it.
        dither_mode: ditherMode,
        dither_strength: ditherStrength,
        // Snap-step distance metric (PR-H). Older filter-service revisions
        // drop this via Pydantic extra-ignore → server stays on OKLab.
        distance_metric: distanceMetric,
        // Palette-cap strategy (PR-I). Older filter-service revisions
        // drop this via Pydantic extra-ignore → server stays on top_n.
        palette_restriction: paletteRestriction,
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
      | { svg?: unknown; region_count?: unknown; palette_indices_used?: unknown }
      | null
    const svgString = typeof payload?.svg === "string" ? payload.svg : null
    const paletteIndicesUsed = Array.isArray(payload?.palette_indices_used)
      ? payload.palette_indices_used.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0)
      : null
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
    const cleanName = stripTraceSuffix(src.name)

    const writeResult = await writeTraceOutputs({
      supabase,
      projectId,
      sourceImageId,
      kind: "pixelate",
      cleanName,
      baseBuffer: cells.baseBuffer,
      svgBuffer,
      croppedWidth: cells.croppedWidth,
      croppedHeight: cells.croppedHeight,
    })
    if (!writeResult.ok) return writeResult
    profiler.mark("storage_upload")
    profiler.mark("db_insert")
    // State is anchored at working_copy.id (PR #257); the trace's own
    // display rect travels with the project_image_trace row (handled by
    // the orchestrator) so no per-output transform copy is needed.

    profiler.report("pixelate", {
      python_phases: callResult.phases,
      output_bytes: svgBuffer.byteLength,
      base_bytes: cells.baseBuffer.byteLength,
      width: cells.croppedWidth,
      height: cells.croppedHeight,
    })

    return {
      ok: true,
      id: writeResult.imageId,
      storagePath: writeResult.objectPath,
      widthPx: cells.croppedWidth,
      heightPx: cells.croppedHeight,
      baseId: writeResult.baseId,
      baseStoragePath: writeResult.baseObjectPath,
      // Freeze the content-rect display rect: the trace sits exactly in the
      // printable content rect (artboard − padding).
      displayRectPxU: region.displayRectPxU,
      paletteIndicesUsed,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pixelate process failed"
    return { ok: false, status: 500, stage: "pixelate_process", reason: msg }
  }
}
