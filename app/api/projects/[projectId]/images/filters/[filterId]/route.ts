import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; filterId: string }> }
) {
  const { projectId, filterId } = await params

  return withFilterRouteAuth(req, projectId, async (req, context) => {
    if (!isUuid(filterId)) {
      return jsonError("Invalid filterId", 400, { stage: "validation", where: "params" })
    }

    const body = await readJson<{ is_hidden?: unknown }>(req, { stage: "filter_patch" })
    if (!body.ok) return body.res
    const isHidden = typeof body.value.is_hidden === "boolean" ? body.value.is_hidden : null
    if (isHidden === null) {
      return jsonError("Body must include boolean `is_hidden`", 400, { stage: "validation", where: "body" })
    }

    const { error } = await context.supabase
      .from("project_image_filters")
      .update({ is_hidden: isHidden })
      .eq("id", filterId)
      .eq("project_id", context.projectId)
    if (error) {
      return jsonError(error.message, 400, { stage: "filter_update", code: (error as { code?: string }).code })
    }

    return NextResponse.json({ ok: true, is_hidden: isHidden })
  })
}
