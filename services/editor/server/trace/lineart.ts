import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { lineartSchema, type LineartParams } from "@/lib/editor/trace/lineart"
import { readTracePalette } from "@/lib/supabase/palette"
import { callFilterService, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { compositeContentRegion } from "@/services/editor/server/trace/composite-content-region"
import { resolveTraceContentRegion } from "@/services/editor/server/trace/content-region-resolve"

export type LineArtFilterSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  /** Content-rect display rect (artboard − padding), frozen onto the trace row
   * so the overlay renders in the printable content rect. */
  displayRectPxU: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }
  /** Unique palette chip indices the snap step emitted in the
   * output (sorted ascending). Null when the filter-service didn't
   * return the field (older revision) or the response shape was
   * unexpected. */
  paletteIndicesUsed: number[] | null
}
export type LineArtFilterResult = LineArtFilterSuccess | Extract<FilterResult<"lineart_process">, { ok: false }>

export async function lineArtImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: LineartParams
}): Promise<LineArtFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const parsed = lineartSchema.safeParse(params)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: `Invalid line art params: ${issues || "unknown"}`,
    }
  }
  const {
    line_thickness: lineThickness,
    blur_amount: blurAmount,
    smoothness,
    num_colors: numColors,
    color_mode: colorMode,
    min_paintable_mm: minPaintableMm,
  } = parsed.data

  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px")
    .eq("id", sourceImageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()

  if (srcErr || !src) {
    return { ok: false, status: 404, stage: "source_lookup", reason: "Source image not found", code: srcErr?.code }
  }

  const origWidth = toInt(src.width_px)
  const origHeight = toInt(src.height_px)
  if (origWidth == null || origHeight == null || origWidth < 1 || origHeight < 1) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid source dimensions" }
  }

  // The trace only converts the printable content rect (artboard − padding).
  const region = await resolveTraceContentRegion({
    supabase,
    projectId,
    intrinsicWPx: origWidth,
    intrinsicHPx: origHeight,
  })
  if (!region.ok) {
    return { ok: false, status: 400, stage: "validation", reason: region.reason }
  }
  const contentW = region.plan.canvasPx.widthPx
  const contentH = region.plan.canvasPx.heightPx

  // Convert the user's "min paintable gap (mm)" into vtracer's inscribed-circle
  // radius threshold in source px. The gap is the CLEAR space between the black
  // outlines; the stroke (line_thickness px) eats line_thickness/2 into the
  // region on each side, so the region must be geometrically
  // (gap + line_thickness) wide → radius = (gap_px + line_thickness) / 2.
  // px/mm comes from the content rect's own pixel size vs its physical mm.
  const pxPerMm = region.displayMmW > 0 ? contentW / region.displayMmW : 0
  const minRadiusPx = Math.max(0, (minPaintableMm * pxPerMm + lineThickness) / 2)

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())
  // Composite onto the content-rect canvas (white where the image doesn't
  // cover); line art traces this content region only.
  const contentBuffer = await compositeContentRegion({ sourceBuffer: srcBuffer, plan: region.plan })

  try {
    const imageBase64 = contentBuffer.toString("base64")

    // Same Munsell-palette contract as pixelate / circulate: snap
    // each vtracer region fill to the nearest chip so the resulting
    // SVG references real palette colors instead of arbitrary
    // median-cut bins. The set of indices used flows back so the
    // mobile Colors sheet can list them.
    const palette = await readTracePalette(supabase, colorMode)

    const callResult = await callFilterService({
      path: "/filters/lineart",
      responseKind: "json",
      body: {
        image_base64: imageBase64,
        line_thickness: lineThickness,
        blur_amount: blurAmount,
        smoothness,
        num_colors: numColors,
        palette_oklab: palette.map((c) => c.oklab),
        palette_rgb: palette.map((c) => c.rgb),
        min_region_radius_px: minRadiusPx,
      },
    })

    if (!callResult.ok) {
      let reason = callResult.reason
      // Lineart's terminal-failure case formerly unwrapped `{ detail }`
      // payloads from FastAPI. Preserve that.
      try {
        const parsed = JSON.parse(reason) as { detail?: unknown }
        if (typeof parsed.detail === "string" && parsed.detail.trim()) {
          reason = parsed.detail
        }
      } catch {
        // non-JSON, keep raw
      }
      return {
        ok: false,
        status: callResult.status,
        stage: callResult.stage === "service_unavailable" ? "service_unavailable" : callResult.stage === "auth" ? "auth" : "lineart_process",
        reason,
      }
    }

    const payload = callResult.json as
      | { svg?: unknown; region_count?: unknown; palette_indices_used?: unknown }
      | null
    const svgString = typeof payload?.svg === "string" ? payload.svg : null
    if (!svgString) {
      return {
        ok: false,
        status: 502,
        stage: "lineart_process",
        reason: "Filter service returned an unexpected payload (missing svg)",
      }
    }
    const paletteIndicesUsed = Array.isArray(payload?.palette_indices_used)
      ? payload.palette_indices_used.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0)
      : null
    const outputBuffer = Buffer.from(svgString, "utf-8")

    const imageId = crypto.randomUUID()
    const objectPath = `projects/${projectId}/images/${imageId}`

    const { error: uploadErr } = await supabase.storage
      .from("project_images")
      .upload(objectPath, outputBuffer, {
        contentType: "image/svg+xml",
        upsert: false,
      })

    if (uploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload line art image" }
    }

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "trace_output",
      name: `${src.name.replace(/ \((?:filter working|pixelate|line art|numerate|B&W hard|B&W soft|B&W warm)\)/g, "")} (line art)`,
      format: "svg",
      width_px: contentW,
      height_px: contentH,
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

    // State is anchored at working_copy.id; no per-output transform copy.


    return {
      ok: true,
      id: imageId,
      storagePath: objectPath,
      widthPx: contentW,
      heightPx: contentH,
      displayRectPxU: region.displayRectPxU,
      paletteIndicesUsed,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Line art process failed"
    return { ok: false, status: 500, stage: "lineart_process", reason: msg }
  }
}
