/**
 * API route: master image existence check.
 *
 * Responsibilities:
 * - Return whether an active image exists for a project (owner-only via auth/RLS).
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
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

  const { data, error } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("role", "master")
    .is("deleted_at", null)
    .limit(1)

  if (error) {
    return jsonError(error.message, 400, { stage: "image_exists_query" })
  }

  return NextResponse.json({ exists: Array.isArray(data) ? data.length > 0 : Boolean(data?.id) })
}

