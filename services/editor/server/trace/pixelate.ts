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
import { resolveMasterState } from "@/services/editor/server/trace/master-state"
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
  } = parsed.data

  const sourceResult = await fetchTraceSourceImage({ supabase, projectId, sourceImageId })
  profiler.mark("source_lookup")
  if (!sourceResult.ok) return sourceResult
  const { src, origWidth, origHeight } = sourceResult

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

  const downloadResult = await downloadSourceImageBuffer({ supabase, src })
  if (!downloadResult.ok) return downloadResult
  const srcBuffer = downloadResult.buffer
  profiler.mark("source_download")

  try {
    // Single sharp pipeline, two outputs from the cropped region. Sending
    // only the per-cell grid to Cloud Run (~22 KB for a 100×75 grid vs
    // ~16 MB for a 12-MP base64 source) is what eliminates the
    // empty-body 500s — Cloud Run's heavy decode + downsample go away.
    const cells = await buildCellsPayload({ srcBuffer, origWidth, origHeight, crop, grid })
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
      // Freeze the apply-time master/working_copy display rect onto the
      // result. `masterState` is the same authoritative DB read that
      // sized the grid above (`resolveMasterState`) — reusing it keeps
      // the persisted geometry byte-consistent with what the user saw
      // on the artboard at apply time.
      displayRectPxU: {
        xPxU: masterState.xPxU,
        yPxU: masterState.yPxU,
        widthPxU: masterState.widthPxU,
        heightPxU: masterState.heightPxU,
      },
      paletteIndicesUsed,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pixelate process failed"
    return { ok: false, status: 500, stage: "pixelate_process", reason: msg }
  }
}
