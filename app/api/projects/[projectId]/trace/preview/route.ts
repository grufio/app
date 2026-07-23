/**
 * Trace preview API (linerate only).
 *
 * Runs the SAME server trace as `POST /api/projects/[projectId]/trace`
 * (apply), but at 0.5 MP work resolution and WITHOUT persisting anything —
 * no SVG upload, no project_images row, no trace-row upsert, no activation.
 * Returns only the raw SVG string, which the Linerate dialog renders inline.
 *
 * Sister to the apply route; kept separate because preview has no side
 * effects (read-only compute + a filter-service call).
 */
import { NextResponse } from "next/server"

import { jsonError, readJson } from "@/lib/api/route-guards"
import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { previewProjectTrace } from "@/services/editor/server/trace"

export const dynamic = "force-dynamic"
// A 0.5 MP linerate preview is lighter than Apply but still calls Cloud Run
// (up to 90 s in the Node caller). Give the route headroom beyond that call.
export const maxDuration = 120

type PreviewTraceRequest = {
  kind?: string
  params?: Record<string, unknown>
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (req, context) => {
    const parsed = await readJson<PreviewTraceRequest>(req, { stage: "validation" })
    if (!parsed.ok) return parsed.res
    const body = parsed.value ?? {}

    const result = await previewProjectTrace({
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
      svg: result.svg,
      width_px: result.width_px,
      height_px: result.height_px,
    })
  })
}
