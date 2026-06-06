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
import { callFilterService, startFilterProfiler, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { readTracePalette } from "@/lib/supabase/palette"
import { resolveMasterState } from "@/services/editor/server/trace/master-state"
import {
  buildCellsPayload,
  downloadSourceImageBuffer,
  fetchTraceSourceImage,
  stripTraceSuffix,
  writeTraceOutputs,
} from "@/services/editor/server/trace/shared"

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
 *
 * Source / palette / upload share their logic with pixelate via
 * `./shared.ts`; grid math + filter-service request body stay here
 * (the inner-ellipse + contour fields make the body diverge enough
 * that parameterising it would obscure rather than clarify).
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
  /** Unique palette chip indices the snap step emitted in the output
   * (sorted ascending). Null when the filter-service didn't return
   * the field (older revision) or the response shape was unexpected. */
  paletteIndicesUsed: number[] | null
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

  const sourceResult = await fetchTraceSourceImage({ supabase, projectId, sourceImageId })
  profiler.mark("source_lookup")
  if (!sourceResult.ok) return sourceResult
  const { src, origWidth, origHeight } = sourceResult

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

  const downloadResult = await downloadSourceImageBuffer({ supabase, src })
  if (!downloadResult.ok) return downloadResult
  const srcBuffer = downloadResult.buffer
  profiler.mark("source_download")

  try {
    // Single sharp pipeline, two outputs from the cropped region (mirrors
    // pixelate post-#323). Sending only the per-cell grid to Cloud Run
    // (~22 KB for a 100×75 grid vs. multi-MB for a base64'd source)
    // avoids the Cloud Run decode + crop + downsample that was causing
    // /filters/circulate 500s on real photos.
    const cells = await buildCellsPayload({ srcBuffer, origWidth, origHeight, crop, grid })
    profiler.mark("sharp_crop")
    profiler.mark("cell_averages")

    // Snap cells to the active Munsell palette server-side: colour →
    // lab_munsell (128), b/w → lab_grays (48). Same contract as pixelate.
    const palette = await readTracePalette(supabase, colorMode)
    profiler.mark("palette_read")

    const callResult = await callFilterService({
      path: "/filters/circulate",
      responseKind: "json",
      body: {
        cells_b64: cells.cellsB64,
        cells_x: grid.cellsX,
        cells_y: grid.cellsY,
        cropped_w_px: cells.croppedWidth,
        cropped_h_px: cells.croppedHeight,
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
        // Cap on distinct chip count in the rendered output. Drives the
        // filter-service's post-snap top-N reduction.
        num_colors: p.num_colors,
        // Pre-snap chroma boost in OKLCh — same contract as pixelate.
        pre_snap_chroma_scale: p.pre_snap_chroma_scale,
        // Texture forwarding — same contract as pixelate. Applies to the
        // outer ellipses only on the server side.
        texture_enabled: p.texture_enabled,
        texture_strength: p.texture_strength,
        // Dithering at the snap step (PR-F). Applied to outer ellipse
        // colour; inner ellipse colour derives from the pre-snap means.
        // Older filter-service revisions drop these via Pydantic extra-
        // ignore → degrade to the snap path.
        dither_mode: p.dither_mode,
        dither_pattern_size: p.dither_pattern_size,
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
        stage: "circulate_process",
        reason: "Filter service returned an unexpected payload (missing svg)",
      }
    }

    const svgBuffer = Buffer.from(svgString, "utf-8")
    const cleanName = stripTraceSuffix(src.name)

    const writeResult = await writeTraceOutputs({
      supabase,
      projectId,
      sourceImageId,
      kind: "circulate",
      cleanName,
      baseBuffer: cells.baseBuffer,
      svgBuffer,
      croppedWidth: cells.croppedWidth,
      croppedHeight: cells.croppedHeight,
    })
    if (!writeResult.ok) return writeResult
    profiler.mark("storage_upload")
    profiler.mark("db_insert")

    profiler.report("circulate", {
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
      // Freeze the apply-time master/working_copy display rect — same
      // authoritative read that sized the grid above.
      displayRectPxU: {
        xPxU: masterState.xPxU,
        yPxU: masterState.yPxU,
        widthPxU: masterState.widthPxU,
        heightPxU: masterState.heightPxU,
      },
      paletteIndicesUsed,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Circulate process failed"
    return { ok: false, status: 500, stage: "circulate_process", reason: msg }
  }
}
