import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { removeProjectImageFilter } from "@/services/editor/server/filter-variants"

export const dynamic = "force-dynamic"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; filterId: string }> }
) {
  const { projectId, filterId } = await params
  if (!isUuid(String(projectId)) || !isUuid(String(filterId))) {
    return jsonError("Invalid params", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()
  const user = await requireUser(supabase)
  if (!user.ok) return user.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  const removed = await removeProjectImageFilter({ supabase, projectId, filterId })
  if (!removed.ok) return jsonError(removed.reason, removed.status, { stage: removed.stage, code: removed.code })

  return NextResponse.json({ ok: true, active_image_id: removed.active_image_id })
}

