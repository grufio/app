/**
 * API route: delete a master image by id.
 *
 * Responsibilities:
 * - Delete storage object first, then DB record.
 * - If the active master was removed, promote the latest remaining master.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; imageId: string }> }
) {
  const { projectId, imageId } = await params
  if (!isUuid(String(projectId)) || !isUuid(String(imageId))) {
    return jsonError("Invalid params", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Explicit access check for clearer staged errors (RLS still enforces).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  return jsonError("Master image is immutable. Deletion is not allowed.", 409, {
    stage: "master_immutable",
    reason: "master_delete_forbidden",
  })
}
