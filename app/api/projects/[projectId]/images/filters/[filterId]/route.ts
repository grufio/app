import { NextResponse } from "next/server"

import { isUuid, jsonError } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
import { removeProjectImageFilter } from "@/services/editor/server/filter-variants"
import { clearProjectTrace } from "@/services/editor/server/trace"

export const dynamic = "force-dynamic"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string; filterId: string }> }
) {
  const { projectId, filterId } = await params

  return withFilterRouteAuth(req, projectId, async (req, context) => {
    if (!isUuid(filterId)) {
      return jsonError("Invalid filterId", 400, { stage: "validation", where: "params" })
    }

    // Single-artifact cascade: the trace is built on the filter output, so
    // removing the filter invalidates it. Clear the trace FIRST (RESTRICT FK
    // project_image_trace.base_image_id → working_copy). No-op when no trace.
    const traceCleared = await clearProjectTrace({ supabase: context.supabase, projectId: context.projectId })
    if (!traceCleared.ok) {
      return jsonError(traceCleared.reason, traceCleared.status, { stage: traceCleared.stage, code: traceCleared.code })
    }

    const removed = await removeProjectImageFilter({
      supabase: context.supabase,
      projectId: context.projectId,
      filterId,
    })
    if (!removed.ok) {
      return jsonError(removed.reason, removed.status, { stage: removed.stage, code: removed.code })
    }

    return NextResponse.json({ ok: true, active_image_id: removed.active_image_id })
  })
}
