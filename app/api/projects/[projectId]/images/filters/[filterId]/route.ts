import { NextResponse } from "next/server"

import { isUuid, jsonError } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"

export const dynamic = "force-dynamic"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string; filterId: string }> }
) {
  const { projectId, filterId } = await params

  return withFilterRouteAuth(projectId, async (req, context) => {
    if (!isUuid(filterId)) {
      return jsonError("Invalid filterId", 400, { stage: "validation", where: "params" })
    }

    // Get the filter to be deleted
    const { data: filter, error: filterErr } = await context.supabase
      .from("project_images")
      .select("id,source_image_id")
      .eq("id", filterId)
      .eq("project_id", context.projectId)
      .eq("role", "asset")
      .is("deleted_at", null)
      .maybeSingle()

    if (filterErr || !filter) {
      return jsonError("Filter not found", 404, { stage: "filter_lookup" })
    }

    // Soft-delete the filter
    const { error: deleteErr } = await context.supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", filterId)

    if (deleteErr) {
      return jsonError("Failed to delete filter", 500, { stage: "delete", code: deleteErr.code })
    }

    // Soft-delete all working copies to force refresh
    await context.supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("project_id", context.projectId)
      .like("name", "%(filter working)")
      .is("deleted_at", null)

    return NextResponse.json({ ok: true, active_image_id: filter.source_image_id })
  })
}
