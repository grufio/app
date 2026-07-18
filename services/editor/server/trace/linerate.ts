import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { LINERATE_RESOLUTION_EDGE, linerateSchema, type LinerateParams } from "@/lib/editor/trace/linerate"
import { readTracePalette } from "@/lib/supabase/palette"
import { callFilterService, toInt, type FilterResult } from "@/services/editor/server/filters/_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import { compositeContentRegion } from "@/services/editor/server/trace/composite-content-region"
import { resolveTraceContentRegion } from "@/services/editor/server/trace/content-region-resolve"

export type LinerateFilterSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  /** Content-rect display rect (artboard − padding), frozen onto the trace row
   * so the overlay renders in the printable content rect. */
  displayRectPxU: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }
  /** Unique palette chip indices the snap step emitted in the output (sorted
   * ascending). Null when the filter-service omitted the field. */
  paletteIndicesUsed: number[] | null
}
export type LinerateFilterResult = LinerateFilterSuccess | Extract<FilterResult<"linerate_process">, { ok: false }>

/**
 * Linerate trace: segmentation-based paint-by-numbers. Mirrors the other trace
 * handlers for source lookup, content-rect compositing, palette snap and
 * activation; only the filter-service endpoint + params differ.
 */
export async function linerateImageAndActivate(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  params: LinerateParams
}): Promise<LinerateFilterResult> {
  const { supabase, projectId, sourceImageId, params } = args
  const parsed = linerateSchema.safeParse(params)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: `Invalid linerate params: ${issues || "unknown"}`,
    }
  }
  const {
    line_thickness: lineThickness,
    flatten,
    detail,
    smoothness,
    radius,
    num_colors: numColors,
    color_mode: colorMode,
    min_paintable_mm: minPaintableMm,
    palette_restriction: paletteRestriction,
    resolution,
  } = parsed.data
  const workEdge = LINERATE_RESOLUTION_EDGE[resolution]

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

  // "min paintable gap (mm)" → inscribed-circle radius threshold in source px.
  // Derivation: the clear gap between the outlines plus the
  // stroke width, halved. px/mm from the content rect's own pixel size vs mm.
  const pxPerMm = region.displayMmW > 0 ? contentW / region.displayMmW : 0
  const minRadiusPx = Math.max(0, (minPaintableMm * pxPerMm + lineThickness) / 2)

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())
  const contentBuffer = await compositeContentRegion({ sourceBuffer: srcBuffer, plan: region.plan })

  // Stage the composited input in storage and hand the filter-service a short-lived
  // SIGNED URL instead of inlining it as base64. A large content image would blow
  // Cloud Run's 32 MB request-body limit (rejected at the GFE as 413, before the
  // container ever runs — no logs). The service downloads the exact same PNG bytes,
  // so the output stays byte-identical. The temp object carries no DB row and is
  // removed in the finally (best-effort).
  const inputTempPath = `projects/${projectId}/images/${crypto.randomUUID()}`
  let inputStaged = false
  try {
    const { error: stageErr } = await supabase.storage
      .from(PROJECT_IMAGES_BUCKET)
      .upload(inputTempPath, contentBuffer, { contentType: "image/png", upsert: false })
    if (stageErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to stage linerate input image" }
    }
    inputStaged = true

    const { data: signed, error: signErr } = await supabase.storage
      .from(PROJECT_IMAGES_BUCKET)
      .createSignedUrl(inputTempPath, SIGNED_URL_TTL.thumbnail)
    if (signErr || !signed?.signedUrl) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to sign linerate input image" }
    }

    const palette = await readTracePalette(supabase, colorMode)

    const callResult = await callFilterService({
      path: "/filters/linerate",
      responseKind: "json",
      // Higher work resolutions legitimately take longer; give the trace the full
      // Cloud-Run budget (90 s) instead of the default 30 s so "High" doesn't abort.
      timeoutMs: 90_000,
      body: {
        image_url: signed.signedUrl,
        line_thickness: lineThickness,
        flatten,
        detail,
        smoothness,
        radius,
        num_colors: numColors,
        palette_oklab: palette.map((c) => c.oklab),
        palette_rgb: palette.map((c) => c.rgb),
        palette_restriction: paletteRestriction,
        min_region_radius_px: minRadiusPx,
        work_edge: workEdge,
      },
    })

    if (!callResult.ok) {
      let reason = callResult.reason
      try {
        const p = JSON.parse(reason) as { detail?: unknown }
        if (typeof p.detail === "string" && p.detail.trim()) {
          reason = p.detail
        }
      } catch {
        // non-JSON, keep raw
      }
      return {
        ok: false,
        status: callResult.status,
        stage: callResult.stage === "service_unavailable" ? "service_unavailable" : callResult.stage === "auth" ? "auth" : "linerate_process",
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
        stage: "linerate_process",
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
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload linerate image" }
    }

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "trace_output",
      name: `${src.name.replace(/ \((?:filter working|pixelate|line art|linerate|numerate|B&W hard|B&W soft|B&W warm)\)/g, "")} (linerate)`,
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
    const msg = e instanceof Error ? e.message : "Linerate process failed"
    return { ok: false, status: 500, stage: "linerate_process", reason: msg }
  } finally {
    // Best-effort cleanup of the staged input. The owner (request-scoped) client
    // can delete it via the project_images_storage_delete_owner policy — the temp
    // object lives under the user's projects/{id}/images/ path, so no service-role
    // (RLS bypass) is needed.
    if (inputStaged) {
      try {
        await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([inputTempPath])
      } catch {
        // Orphan is auditable; a storage lifecycle sweep can reap it later.
      }
    }
  }
}
