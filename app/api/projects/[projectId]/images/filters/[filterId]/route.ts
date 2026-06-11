import { NextResponse } from "next/server"

import { isUuid, jsonError } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
import { removeProjectImageFilter } from "@/services/editor/server/filter-variants"

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
