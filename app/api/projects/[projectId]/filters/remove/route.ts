import { NextResponse } from "next/server"

import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function DELETE(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params

  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }

  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  // Find working copy for this project
  const { data: workingCopy, error: workingErr } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("role", "asset")
    .like("name", "%(filter working)")
    .is("deleted_at", null)
    .maybeSingle()

  if (workingErr || !workingCopy) {
    return jsonError("Working copy not found", 404, { stage: "working_copy_lookup" })
  }

  // Find filter result (has source_image_id = workingCopy.id)
  const { data: filterResult, error: filterErr } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("source_image_id", workingCopy.id)
    .eq("role", "asset")
    .is("deleted_at", null)
    .maybeSingle()

  if (filterErr || !filterResult) {
    return jsonError("No filter applied", 404, { stage: "filter_lookup" })
  }

  // Soft-delete the filter result
  const { error: deleteErr } = await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", filterResult.id)

  if (deleteErr) {
    return jsonError("Failed to delete filter result", 500, { stage: "delete", code: deleteErr.code })
  }

  return NextResponse.json({ ok: true })
}
