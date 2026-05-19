/**
 * Trace API surface (F21).
 *
 * Single-row-per-project Trace artefact (numerate xor lineart).
 * Replacing a Trace overwrites the row and tombstones the prior
 * output image; clearing deletes the row and re-activates the
 * fallback image (filter-tip or master).
 *
 * Sister to the per-filter routes under `/filters/*` — kept
 * separate because Trace has no chain semantics.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { jsonError, readJson } from "@/lib/api/route-guards"
import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import {
  applyProjectTrace,
  clearProjectTrace,
  getProjectTrace,
} from "@/services/editor/server/trace"

export const dynamic = "force-dynamic"

type ApplyTraceRequest = {
  kind?: string
  params?: Record<string, unknown>
  /** Image's displayed mm size on the artboard at apply-time.
   * Optional; sent by the dialog from its live canvas mirror so the
   * server doesn't have to read potentially-stale `project_image_state`. */
  display_mm_w?: number
  display_mm_h?: number
}

/** Resolve the trace's base image (cropped source bitmap) to a
 * signed-URL payload the client can pipe straight into Konva. Null
 * when the trace has no `base_image_id` (lineart) or the underlying
 * row vanished — the editor falls back to the filter-tip in that
 * case. Server-side so the client only does one round-trip. */
async function resolveTraceBaseImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  baseImageId: string | null
}): Promise<{ id: string; signedUrl: string; width_px: number; height_px: number } | null> {
  if (!args.baseImageId) return null
  const { data: row } = await args.supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,width_px,height_px")
    .eq("project_id", args.projectId)
    .eq("id", args.baseImageId)
    .eq("kind", "trace_base")
    .is("deleted_at", null)
    .maybeSingle()
  if (!row?.storage_path) return null
  const { data: signed } = await args.supabase.storage
    .from(String(row.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .createSignedUrl(String(row.storage_path), SIGNED_URL_TTL.filterWorkingCopy)
  if (!signed?.signedUrl) return null
  return {
    id: String(row.id),
    signedUrl: signed.signedUrl,
    width_px: Number(row.width_px ?? 0),
    height_px: Number(row.height_px ?? 0),
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_req, context) => {
    const result = await getProjectTrace({ supabase: context.supabase, projectId: context.projectId })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    const baseImage = await resolveTraceBaseImage({
      supabase: context.supabase,
      projectId: context.projectId,
      baseImageId: result.trace?.base_image_id ?? null,
    })
    return NextResponse.json({ ok: true, trace: result.trace, base_image: baseImage })
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (req, context) => {
    const parsed = await readJson<ApplyTraceRequest>(req, { stage: "validation" })
    if (!parsed.ok) return parsed.res
    const body = parsed.value ?? {}

    const result = await applyProjectTrace({
      supabase: context.supabase,
      projectId: context.projectId,
      kind: body.kind,
      params: body.params,
      displayMmW: typeof body.display_mm_w === "number" ? body.display_mm_w : undefined,
      displayMmH: typeof body.display_mm_h === "number" ? body.display_mm_h : undefined,
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    const baseImage = await resolveTraceBaseImage({
      supabase: context.supabase,
      projectId: context.projectId,
      baseImageId: result.trace.base_image_id,
    })
    return NextResponse.json({
      ok: true,
      trace: result.trace,
      image_id: result.image_id,
      width_px: result.width_px,
      height_px: result.height_px,
      base_image: baseImage,
    })
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_req, context) => {
    const result = await clearProjectTrace({ supabase: context.supabase, projectId: context.projectId })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    return NextResponse.json({ ok: true, active_image_id: result.active_image_id })
  })
}
