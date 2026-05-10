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
import { NextResponse } from "next/server"

import { jsonError, readJson } from "@/lib/api/route-guards"
import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import {
  applyProjectTrace,
  clearProjectTrace,
  getProjectTrace,
} from "@/services/editor/server/trace"

export const dynamic = "force-dynamic"

type ApplyTraceRequest = {
  kind?: string
  params?: Record<string, unknown>
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
    return NextResponse.json({ ok: true, trace: result.trace })
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
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    return NextResponse.json({
      ok: true,
      trace: result.trace,
      image_id: result.image_id,
      width_px: result.width_px,
      height_px: result.height_px,
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
